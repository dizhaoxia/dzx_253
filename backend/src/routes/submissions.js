const express = require('express');
const { pool } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');
const { judgeQueue, STATUS_DISPLAY } = require('../judge/judgeQueue');

const router = express.Router();

const getDisplayStatus = (status) => {
  return STATUS_DISPLAY[status] || status;
};

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { problem_id, code, language } = req.body;
    const user_id = req.user.id;

    if (!problem_id || !code || !language) {
      return res.status(400).json({ error: 'problem_id, code, and language are required' });
    }

    if (!['cpp', 'python'].includes(language)) {
      return res.status(400).json({ error: 'Unsupported language' });
    }

    const [problems] = await pool.execute('SELECT id FROM problems WHERE id = ?', [problem_id]);
    if (problems.length === 0) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    const [result] = await pool.execute(
      'INSERT INTO submissions (user_id, problem_id, code, language, status, score) VALUES (?, ?, ?, ?, ?, ?)',
      [user_id, problem_id, code, language, 'Pending', 0]
    );

    const submission = {
      id: result.insertId,
      user_id,
      problem_id,
      code,
      language
    };

    res.status(201).json({
      id: submission.id,
      status: 'Pending',
      display_status: getDisplayStatus('Pending'),
      score: 0,
      message: 'Submission received'
    });

    judgeQueue.add(submission).catch(err => {
      console.error('Judge queue error:', err);
    });
  } catch (error) {
    console.error('Submit error:', error);
    res.status(500).json({ error: 'Failed to submit code' });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const [submissions] = await pool.execute(`
      SELECT s.id, s.user_id, s.problem_id, s.language, s.status, s.score, s.time_used, s.memory_used, s.error_message, s.created_at, s.code,
             u.username, p.title as problem_title
      FROM submissions s
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN problems p ON s.problem_id = p.id
      WHERE s.id = ?
    `, [id]);

    if (submissions.length === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    const submission = submissions[0];
    submission.display_status = getDisplayStatus(submission.status);

    const [testCases] = await pool.execute(`
      SELECT id, test_case_number, status, time_used, memory_used, actual_output, error_message, created_at
      FROM submission_test_cases
      WHERE submission_id = ?
      ORDER BY test_case_number ASC
    `, [id]);

    submission.test_cases = testCases.map(tc => ({
      ...tc,
      display_status: getDisplayStatus(tc.status)
    }));

    res.json(submission);
  } catch (error) {
    console.error('Get submission error:', error);
    res.status(500).json({ error: 'Failed to get submission' });
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { user_id, problem_id, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT s.id, s.user_id, s.problem_id, s.language, s.status, s.score, s.time_used, s.memory_used, s.created_at, u.username, p.title as problem_title FROM submissions s LEFT JOIN users u ON s.user_id = u.id LEFT JOIN problems p ON s.problem_id = p.id';
    const conditions = [];
    const values = [];

    if (user_id) {
      conditions.push('s.user_id = ?');
      values.push(parseInt(user_id));
    }
    if (problem_id) {
      conditions.push('s.problem_id = ?');
      values.push(parseInt(problem_id));
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    const safeLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 200);
    const safeOffset = Math.max(parseInt(offset) || 0, 0);
    query += ` ORDER BY s.id DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`;

    const [submissions] = values.length > 0
      ? await pool.execute(query, values)
      : await pool.query(query);

    const result = submissions.map(s => ({
      ...s,
      display_status: getDisplayStatus(s.status)
    }));

    res.json(result);
  } catch (error) {
    console.error('Get submissions error:', error.message, error.sql || '');
    res.status(500).json({ error: 'Failed to get submissions' });
  }
});

module.exports = router;
