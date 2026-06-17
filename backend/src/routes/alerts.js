const express = require('express');
const { pool } = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { plagiarismDetector } = require('../services/plagiarismDetector');

const router = express.Router();

router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const stats = await plagiarismDetector.getAlertStats();
    res.json(stats);
  } catch (error) {
    console.error('Get alert stats error:', error);
    res.status(500).json({ error: 'Failed to get alert statistics' });
  }
});

router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const validStatuses = ['pending', 'reviewed', 'dismissed', 'confirmed', null];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await plagiarismDetector.getAlerts(
      status,
      parseInt(page),
      parseInt(limit)
    );

    res.json(result);
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ error: 'Failed to get alerts' });
  }
});

router.get('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const [alerts] = await pool.execute(`
      SELECT sa.*, 
             u1.username as user_name,
             u2.username as matched_user_name,
             p.title as problem_title,
             s1.code as submission_code,
             s1.language as submission_language,
             s1.status as submission_status,
             s1.created_at as submission_created_at,
             s2.code as matched_code,
             s2.language as matched_language,
             s2.status as matched_status,
             s2.created_at as matched_created_at,
             u3.username as reviewer_name
      FROM similarity_alerts sa
      LEFT JOIN users u1 ON sa.user_id = u1.id
      LEFT JOIN users u2 ON sa.matched_user_id = u2.id
      LEFT JOIN problems p ON sa.problem_id = p.id
      LEFT JOIN submissions s1 ON sa.submission_id = s1.id
      LEFT JOIN submissions s2 ON sa.matched_submission_id = s2.id
      LEFT JOIN users u3 ON sa.reviewed_by = u3.id
      WHERE sa.id = ?
    `, [id]);

    if (alerts.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json(alerts[0]);
  } catch (error) {
    console.error('Get alert detail error:', error);
    res.status(500).json({ error: 'Failed to get alert detail' });
  }
});

router.put('/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    const reviewedBy = req.user.id;

    const validStatuses = ['pending', 'reviewed', 'dismissed', 'confirmed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updated = await plagiarismDetector.updateAlertStatus(
      parseInt(id),
      status,
      reviewedBy,
      notes
    );

    if (!updated) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json(updated);
  } catch (error) {
    console.error('Update alert status error:', error);
    res.status(500).json({ error: 'Failed to update alert status' });
  }
});

router.post('/batch-status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { ids, status, notes } = req.body;
    const reviewedBy = req.user.id;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid ids' });
    }

    const validStatuses = ['pending', 'reviewed', 'dismissed', 'confirmed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const results = [];
    for (const id of ids) {
      try {
        const updated = await plagiarismDetector.updateAlertStatus(
          parseInt(id),
          status,
          reviewedBy,
          notes
        );
        if (updated) {
          results.push({ id, success: true });
        }
      } catch (err) {
        results.push({ id, success: false, error: err.message });
      }
    }

    res.json({
      updated: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    });
  } catch (error) {
    console.error('Batch update alert status error:', error);
    res.status(500).json({ error: 'Failed to batch update alert statuses' });
  }
});

module.exports = router;
