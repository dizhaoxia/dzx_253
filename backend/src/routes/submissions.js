const express = require('express');
const { pool } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');
const judgeQueue = require('../judge/judgeQueue');

const router = express.Router();

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
      'INSERT INTO submissions (user_id, problem_id, code, language, status) VALUES (?, ?, ?, ?, ?)',
      [user_id, problem_id, code, language, 'Pending']
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
      SELECT s.id, s.user_id, s.problem_id, s.language, s.status, s.time_used, s.memory_used, s.created_at,
             u.username, p.title as problem_title
      FROM submissions s
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN problems p ON s.problem_id = p.id
      WHERE s.id = ?
    `, [id]);

    if (submissions.length === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    res.json(submissions[0]);
  } catch (error) {
    console.error('Get submission error:', error);
    res.status(500).json({ error: 'Failed to get submission' });
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { user_id, problem_id, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT s.id, s.user_id, s.problem_id, s.language, s.status, s.time_used, s.memory_used, s.created_at,
             u.username, p.title as problem_title
      FROM submissions s
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN problems p ON s.problem_id = p.id
    `;
    const conditions = [];
    const values = [];

    if (user_id) {
      conditions.push('s.user_id = ?');
      values.push(user_id);
    }
    if (problem_id) {
      conditions.push('s.problem_id = ?');
      values.push(problem_id);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY s.id DESC LIMIT ? OFFSET ?';
    values.push(parseInt(limit), parseInt(offset));

    const [submissions] = await pool.execute(query, values);
    res.json(submissions);
  } catch (error) {
    console.error('Get submissions error:', error);
    res.status(500).json({ error: 'Failed to get submissions' });
  }
});

module.exports = router;
