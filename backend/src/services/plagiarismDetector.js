const { pool } = require('../config/db');
const { simHash, SIMILARITY_THRESHOLD } = require('../utils/simhash');
const { getSocketManager } = require('../realTime/socketManager');

class PlagiarismDetector {
  constructor() {
    this.threshold = SIMILARITY_THRESHOLD;
  }

  async processAcceptedSubmission(submissionId, userId, problemId, code, language) {
    try {
      const fingerprint = simHash.compute(code, language);
      const fingerprintStr = simHash.fingerprintToString(fingerprint);
      const codeLength = code.length;

      await pool.execute(
        `INSERT INTO code_fingerprints 
         (submission_id, user_id, problem_id, fingerprint, language, code_length) 
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE fingerprint = ?, code_length = ?`,
        [submissionId, userId, problemId, fingerprintStr, language, codeLength, fingerprintStr, codeLength]
      );

      const matches = await this.findSimilarSubmissions(
        submissionId,
        userId,
        problemId,
        fingerprint,
        language
      );

      for (const match of matches) {
        await this.createAlert(
          submissionId,
          userId,
          problemId,
          match.submission_id,
          match.user_id,
          match.similarity,
          match.hamming_distance
        );
      }

      return {
        fingerprint: fingerprintStr,
        matchCount: matches.length,
        matches
      };
    } catch (error) {
      console.error('Plagiarism detection error:', error);
      throw error;
    }
  }

  async findSimilarSubmissions(submissionId, userId, problemId, fingerprint, language) {
    try {
      const [existingFingerprints] = await pool.execute(`
        SELECT cf.submission_id, cf.user_id, cf.fingerprint, cf.code_length
        FROM code_fingerprints cf
        WHERE cf.problem_id = ? 
          AND cf.language = ? 
          AND cf.user_id != ?
          AND cf.submission_id != ?
      `, [problemId, language, userId, submissionId]);

      const matches = [];

      for (const existing of existingFingerprints) {
        const existingFingerprint = simHash.stringToFingerprint(existing.fingerprint);
        const distance = simHash.hammingDistance(fingerprint, existingFingerprint);
        const similarity = simHash.similarityScore(fingerprint, existingFingerprint);

        if (similarity >= this.threshold) {
          const lenDiff = Math.abs(existing.code_length - code.length);
          const maxLen = Math.max(existing.code_length, code.length);
          const lenSimilarity = maxLen > 0 ? (1 - lenDiff / maxLen) * 100 : 100;

          if (lenSimilarity >= 50) {
            matches.push({
              submission_id: existing.submission_id,
              user_id: existing.user_id,
              similarity: Math.round(similarity * 100) / 100,
              hamming_distance: distance,
              code_length: existing.code_length
            });
          }
        }
      }

      matches.sort((a, b) => b.similarity - a.similarity);

      return matches;
    } catch (error) {
      console.error('Find similar submissions error:', error);
      return [];
    }
  }

  async createAlert(submissionId, userId, problemId, matchedSubmissionId, matchedUserId, similarity, hammingDistance) {
    try {
      const [existing] = await pool.execute(`
        SELECT id FROM similarity_alerts 
        WHERE submission_id = ? AND matched_submission_id = ?
        OR (submission_id = ? AND matched_submission_id = ?)
      `, [submissionId, matchedSubmissionId, matchedSubmissionId, submissionId]);

      if (existing.length > 0) {
        return null;
      }

      const [result] = await pool.execute(`
        INSERT INTO similarity_alerts 
        (submission_id, user_id, problem_id, matched_submission_id, matched_user_id, 
         similarity_score, hamming_distance, status) 
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
      `, [submissionId, userId, problemId, matchedSubmissionId, matchedUserId, similarity, hammingDistance]);

      const socketManager = getSocketManager();
      if (socketManager) {
        const [alertDetail] = await pool.execute(`
          SELECT sa.*, 
                 u1.username as user_name,
                 u2.username as matched_user_name,
                 p.title as problem_title
          FROM similarity_alerts sa
          LEFT JOIN users u1 ON sa.user_id = u1.id
          LEFT JOIN users u2 ON sa.matched_user_id = u2.id
          LEFT JOIN problems p ON sa.problem_id = p.id
          WHERE sa.id = ?
        `, [result.insertId]);

        if (alertDetail.length > 0) {
          socketManager.broadcastToAll('plagiarism_alert', alertDetail[0]);
        }
      }

      return result.insertId;
    } catch (error) {
      console.error('Create alert error:', error);
      throw error;
    }
  }

  async getAlerts(status = null, page = 1, limit = 20) {
    try {
      const offset = (page - 1) * limit;
      let query = `
        SELECT sa.*, 
               u1.username as user_name,
               u2.username as matched_user_name,
               p.title as problem_title,
               s1.code as submission_code,
               s2.code as matched_code,
               u3.username as reviewer_name
        FROM similarity_alerts sa
        LEFT JOIN users u1 ON sa.user_id = u1.id
        LEFT JOIN users u2 ON sa.matched_user_id = u2.id
        LEFT JOIN problems p ON sa.problem_id = p.id
        LEFT JOIN submissions s1 ON sa.submission_id = s1.id
        LEFT JOIN submissions s2 ON sa.matched_submission_id = s2.id
        LEFT JOIN users u3 ON sa.reviewed_by = u3.id
      `;
      const values = [];

      if (status) {
        query += ' WHERE sa.status = ?';
        values.push(status);
      }

      query += ' ORDER BY sa.created_at DESC LIMIT ? OFFSET ?';
      values.push(limit, offset);

      const [alerts] = await pool.execute(query, values);

      const [countResult] = await pool.execute(
        `SELECT COUNT(*) as total FROM similarity_alerts ${status ? 'WHERE status = ?' : ''}`,
        status ? [status] : []
      );

      return {
        alerts,
        total: countResult[0].total,
        page,
        limit,
        totalPages: Math.ceil(countResult[0].total / limit)
      };
    } catch (error) {
      console.error('Get alerts error:', error);
      throw error;
    }
  }

  async updateAlertStatus(alertId, status, reviewedBy, notes = null) {
    try {
      const validStatuses = ['pending', 'reviewed', 'dismissed', 'confirmed'];
      if (!validStatuses.includes(status)) {
        throw new Error('Invalid status');
      }

      const [result] = await pool.execute(`
        UPDATE similarity_alerts 
        SET status = ?, reviewed_by = ?, reviewed_at = NOW(), notes = ?
        WHERE id = ?
      `, [status, reviewedBy, notes, alertId]);

      if (result.affectedRows === 0) {
        return null;
      }

      const [updated] = await pool.execute(`
        SELECT sa.*, 
               u1.username as user_name,
               u2.username as matched_user_name,
               p.title as problem_title
        FROM similarity_alerts sa
        LEFT JOIN users u1 ON sa.user_id = u1.id
        LEFT JOIN users u2 ON sa.matched_user_id = u2.id
        LEFT JOIN problems p ON sa.problem_id = p.id
        WHERE sa.id = ?
      `, [alertId]);

      return updated[0] || null;
    } catch (error) {
      console.error('Update alert status error:', error);
      throw error;
    }
  }

  async getAlertStats() {
    try {
      const [stats] = await pool.execute(`
        SELECT 
          status,
          COUNT(*) as count
        FROM similarity_alerts
        GROUP BY status
        ORDER BY count DESC
      `);

      const [recent] = await pool.execute(`
        SELECT sa.*, 
               u1.username as user_name,
               u2.username as matched_user_name,
               p.title as problem_title
        FROM similarity_alerts sa
        LEFT JOIN users u1 ON sa.user_id = u1.id
        LEFT JOIN users u2 ON sa.matched_user_id = u2.id
        LEFT JOIN problems p ON sa.problem_id = p.id
        ORDER BY sa.created_at DESC
        LIMIT 5
      `);

      const statsMap = {
        pending: 0,
        reviewed: 0,
        dismissed: 0,
        confirmed: 0,
        total: 0
      };

      stats.forEach(s => {
        statsMap[s.status] = s.count;
        statsMap.total += s.count;
      });

      return {
        stats: statsMap,
        recent
      };
    } catch (error) {
      console.error('Get alert stats error:', error);
      throw error;
    }
  }
}

const plagiarismDetector = new PlagiarismDetector();

module.exports = {
  PlagiarismDetector,
  plagiarismDetector
};
