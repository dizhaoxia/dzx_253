const express = require('express');
const { pool } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const [rooms] = await pool.execute(`
      SELECT DISTINCT r.id, r.room_code, r.name, r.creator_id, r.created_at,
             u.username as creator_name,
             (SELECT COUNT(*) FROM room_members rm WHERE rm.room_id = r.id) as member_count
      FROM rooms r
      LEFT JOIN room_members rm ON r.id = rm.room_id
      LEFT JOIN users u ON r.creator_id = u.id
      WHERE rm.user_id = ? OR r.creator_id = ?
      ORDER BY r.created_at DESC
      LIMIT 20
    `, [userId, userId]);

    res.json(rooms);
  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({ error: 'Failed to get rooms' });
  }
});

router.get('/:roomCode', authenticateToken, async (req, res) => {
  try {
    const { roomCode } = req.params;

    const [rooms] = await pool.execute(`
      SELECT r.*, u.username as creator_name
      FROM rooms r
      LEFT JOIN users u ON r.creator_id = u.id
      WHERE room_code = ?
    `, [roomCode]);

    if (rooms.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const room = rooms[0];

    const [members] = await pool.execute(`
      SELECT u.id, u.username, u.role, rm.joined_at
      FROM room_members rm
      LEFT JOIN users u ON rm.user_id = u.id
      WHERE rm.room_id = ?
      ORDER BY rm.joined_at ASC
    `, [room.id]);

    const [messages] = await pool.execute(`
      SELECT rm.*, u.username
      FROM room_messages rm
      LEFT JOIN users u ON rm.user_id = u.id
      WHERE rm.room_id = ?
      ORDER BY rm.created_at DESC
      LIMIT 100
    `, [room.id]);

    res.json({
      ...room,
      members,
      messages: messages.reverse()
    });
  } catch (error) {
    console.error('Get room error:', error);
    res.status(500).json({ error: 'Failed to get room' });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;
    const userId = req.user.id;

    let roomCode;
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 10) {
      roomCode = Math.floor(100000 + Math.random() * 900000).toString();
      const [existing] = await pool.execute('SELECT id FROM rooms WHERE room_code = ?', [roomCode]);
      if (existing.length === 0) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      return res.status(500).json({ error: 'Failed to generate unique room code' });
    }

    const [result] = await pool.execute(
      'INSERT INTO rooms (room_code, name, creator_id) VALUES (?, ?, ?)',
      [roomCode, name || `${req.user.username}'s Room`, userId]
    );

    await pool.execute(
      'INSERT INTO room_members (room_id, user_id) VALUES (?, ?)',
      [result.insertId, userId]
    );

    const [createdRoom] = await pool.execute(`
      SELECT r.*, u.username as creator_name
      FROM rooms r
      LEFT JOIN users u ON r.creator_id = u.id
      WHERE r.id = ?
    `, [result.insertId]);

    res.status(201).json({
      ...createdRoom[0],
      member_count: 1,
      members: [{
        id: userId,
        username: req.user.username,
        role: req.user.role
      }]
    });
  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

router.post('/:roomCode/join', authenticateToken, async (req, res) => {
  try {
    const { roomCode } = req.params;
    const userId = req.user.id;

    const [rooms] = await pool.execute('SELECT * FROM rooms WHERE room_code = ?', [roomCode]);
    if (rooms.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const room = rooms[0];

    try {
      await pool.execute(
        'INSERT INTO room_members (room_id, user_id) VALUES (?, ?)',
        [room.id, userId]
      );
    } catch (e) {
      if (e.code !== 'ER_DUP_ENTRY') {
        throw e;
      }
    }

    const [members] = await pool.execute(`
      SELECT u.id, u.username, u.role, rm.joined_at
      FROM room_members rm
      LEFT JOIN users u ON rm.user_id = u.id
      WHERE rm.room_id = ?
      ORDER BY rm.joined_at ASC
    `, [room.id]);

    res.json({
      room,
      members
    });
  } catch (error) {
    console.error('Join room error:', error);
    res.status(500).json({ error: 'Failed to join room' });
  }
});

router.post('/:roomCode/leave', authenticateToken, async (req, res) => {
  try {
    const { roomCode } = req.params;
    const userId = req.user.id;

    const [rooms] = await pool.execute('SELECT id FROM rooms WHERE room_code = ?', [roomCode]);
    if (rooms.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    await pool.execute(
      'DELETE FROM room_members WHERE room_id = ? AND user_id = ?',
      [rooms[0].id, userId]
    );

    res.json({ message: 'Left room successfully' });
  } catch (error) {
    console.error('Leave room error:', error);
    res.status(500).json({ error: 'Failed to leave room' });
  }
});

module.exports = router;
