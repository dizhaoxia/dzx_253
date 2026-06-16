const express = require('express');
const { pool } = require('../config/db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const [rankings] = await pool.execute(`
      SELECT 
        u.id as user_id,
        u.username,
        COUNT(DISTINCT s.problem_id) as solved_count
      FROM users u
      LEFT JOIN submissions s ON u.id = s.user_id AND s.status = 'Accepted'
      GROUP BY u.id, u.username
      ORDER BY solved_count DESC, u.id ASC
    `);

    res.json(rankings);
  } catch (error) {
    console.error('Get rankings error:', error);
    res.status(500).json({ error: 'Failed to get rankings' });
  }
});

module.exports = router;
