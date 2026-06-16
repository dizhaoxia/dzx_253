const express = require('express');
const { pool } = require('../config/db');
const { getCache, setCache, delCache } = require('../config/redis');

const router = express.Router();
const RANKINGS_CACHE_KEY = 'rankings:all';
const RANKINGS_CACHE_TTL = 300;

router.get('/', async (req, res) => {
  try {
    const cached = await getCache(RANKINGS_CACHE_KEY);
    if (cached) {
      return res.json(cached);
    }

    const [rankings] = await pool.execute(`
      SELECT 
        u.id as user_id,
        u.username,
        COUNT(DISTINCT s.problem_id) as solved_count,
        COALESCE(SUM(CASE WHEN s.status = 'AC' THEN 1 ELSE 0 END), 0) as ac_submissions,
        COALESCE(AVG(CASE WHEN s.status = 'AC' THEN s.score END), 0) as avg_score
      FROM users u
      LEFT JOIN submissions s ON u.id = s.user_id AND s.status = 'AC'
      GROUP BY u.id, u.username
      ORDER BY solved_count DESC, avg_score DESC, u.id ASC
      LIMIT 100
    `);

    await setCache(RANKINGS_CACHE_KEY, rankings, RANKINGS_CACHE_TTL);

    res.json(rankings);
  } catch (error) {
    console.error('Get rankings error:', error);
    res.status(500).json({ error: 'Failed to get rankings' });
  }
});

router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const cacheKey = `rankings:user:${userId}`;

    const cached = await getCache(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const [userStats] = await pool.execute(`
      SELECT 
        u.id as user_id,
        u.username,
        u.created_at,
        COUNT(DISTINCT s.problem_id) as solved_count,
        COUNT(s.id) as total_submissions,
        COALESCE(SUM(CASE WHEN s.status = 'AC' THEN 1 ELSE 0 END), 0) as ac_count,
        COALESCE(AVG(CASE WHEN s.status = 'AC' THEN s.score END), 0) as avg_score
      FROM users u
      LEFT JOIN submissions s ON u.id = s.user_id
      WHERE u.id = ?
      GROUP BY u.id, u.username, u.created_at
    `, [userId]);

    if (userStats.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [solvedProblems] = await pool.execute(`
      SELECT DISTINCT p.id, p.title, s.score, s.created_at
      FROM submissions s
      LEFT JOIN problems p ON s.problem_id = p.id
      WHERE s.user_id = ? AND s.status = 'AC'
      ORDER BY s.created_at DESC
    `, [userId]);

    const result = {
      ...userStats[0],
      solved_problems: solvedProblems
    };

    await setCache(cacheKey, result, 120);

    res.json(result);
  } catch (error) {
    console.error('Get user ranking error:', error);
    res.status(500).json({ error: 'Failed to get user ranking' });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    await delCache(RANKINGS_CACHE_KEY);
    res.json({ message: 'Rankings cache refreshed' });
  } catch (error) {
    console.error('Refresh rankings cache error:', error);
    res.status(500).json({ error: 'Failed to refresh rankings cache' });
  }
});

module.exports = router;
