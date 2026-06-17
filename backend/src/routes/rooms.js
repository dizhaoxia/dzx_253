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
      SELECT u.id, u.username, u.role, rm.joined_at,
             rm.solved_count, rm.total_time, rm.competition_score, rm.last_ac_time
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

    const [rankings] = await pool.execute(`
      SELECT 
        rm.user_id,
        u.username,
        rm.solved_count,
        rm.total_time,
        rm.competition_score,
        rm.last_ac_time
      FROM room_members rm
      LEFT JOIN users u ON rm.user_id = u.id
      WHERE rm.room_id = ?
      ORDER BY rm.competition_score DESC, rm.last_ac_time ASC
    `, [room.id]);

    res.json({
      ...room,
      members,
      messages: messages.reverse(),
      rankings
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

const checkRoomOwnerOrAdmin = async (roomId, userId, userRole) => {
  const [rooms] = await pool.execute(
    'SELECT creator_id FROM rooms WHERE id = ?',
    [roomId]
  );
  if (rooms.length === 0) return false;
  return rooms[0].creator_id === userId || userRole === 'admin';
};

router.post('/:roomCode/start', authenticateToken, async (req, res) => {
  try {
    const { roomCode } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;
    const { duration_minutes = 60 } = req.body;

    const [rooms] = await pool.execute(
      'SELECT r.*, u.username as creator_name FROM rooms r LEFT JOIN users u ON r.creator_id = u.id WHERE room_code = ?',
      [roomCode]
    );
    if (rooms.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const room = rooms[0];

    if (!(await checkRoomOwnerOrAdmin(room.id, userId, userRole))) {
      return res.status(403).json({ error: 'Only room owner or admin can start competition' });
    }

    if (room.status === 'running') {
      return res.status(400).json({ error: 'Competition is already running' });
    }

    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + duration_minutes * 60 * 1000);

    await pool.execute(`
      UPDATE rooms 
      SET status = 'running', 
          start_time = ?, 
          end_time = ?, 
          duration_minutes = ?,
          is_locked = 0
      WHERE id = ?
    `, [startTime, endTime, duration_minutes, room.id]);

    await pool.execute(`
      UPDATE room_members 
      SET solved_count = 0, total_time = 0, last_ac_time = NULL, competition_score = 0
      WHERE room_id = ?
    `, [room.id]);

    const [problems] = await pool.execute(`
      SELECT id, title, description, input_format, output_format, 
             time_limit, memory_limit, sample_input, sample_output, 
             test_case_count, difficulty, created_at
      FROM problems 
      ORDER BY id ASC
    `);

    const [members] = await pool.execute(`
      SELECT u.id, u.username, u.role, rm.joined_at,
             rm.solved_count, rm.total_time, rm.competition_score
      FROM room_members rm
      LEFT JOIN users u ON rm.user_id = u.id
      WHERE rm.room_id = ?
      ORDER BY rm.joined_at ASC
    `, [room.id]);

    const { getSocketManager } = require('../realTime/socketManager');
    const socketManager = getSocketManager();
    if (socketManager) {
      socketManager.broadcastToRoom(roomCode, 'competition_started', {
        room_code: roomCode,
        room_id: room.id,
        start_time: startTime,
        end_time: endTime,
        duration_minutes,
        problems,
        members
      });
    }

    res.json({
      message: 'Competition started successfully',
      room: {
        ...room,
        status: 'running',
        start_time: startTime,
        end_time: endTime,
        duration_minutes
      },
      problems,
      members
    });
  } catch (error) {
    console.error('Start competition error:', error);
    res.status(500).json({ error: 'Failed to start competition' });
  }
});

router.post('/:roomCode/end', authenticateToken, async (req, res) => {
  try {
    const { roomCode } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const [rooms] = await pool.execute(
      'SELECT * FROM rooms WHERE room_code = ?',
      [roomCode]
    );
    if (rooms.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const room = rooms[0];

    if (!(await checkRoomOwnerOrAdmin(room.id, userId, userRole))) {
      return res.status(403).json({ error: 'Only room owner or admin can end competition' });
    }

    if (room.status !== 'running') {
      return res.status(400).json({ error: 'No competition is running' });
    }

    const endTime = new Date();

    await pool.execute(`
      UPDATE rooms 
      SET status = 'ended', 
          end_time = ?,
          is_locked = 1
      WHERE id = ?
    `, [endTime, room.id]);

    const [rankings] = await pool.execute(`
      SELECT 
        rm.user_id,
        u.username,
        rm.solved_count,
        rm.total_time,
        rm.competition_score,
        rm.last_ac_time
      FROM room_members rm
      LEFT JOIN users u ON rm.user_id = u.id
      WHERE rm.room_id = ?
      ORDER BY rm.competition_score DESC, rm.last_ac_time ASC
    `, [room.id]);

    const { getSocketManager } = require('../realTime/socketManager');
    const socketManager = getSocketManager();
    if (socketManager) {
      socketManager.broadcastToRoom(roomCode, 'competition_ended', {
        room_code: roomCode,
        room_id: room.id,
        end_time: endTime,
        rankings
      });
    }

    res.json({
      message: 'Competition ended successfully',
      room: {
        ...room,
        status: 'ended',
        end_time: endTime,
        is_locked: 1
      },
      rankings
    });
  } catch (error) {
    console.error('End competition error:', error);
    res.status(500).json({ error: 'Failed to end competition' });
  }
});

router.get('/:roomCode/rankings', authenticateToken, async (req, res) => {
  try {
    const { roomCode } = req.params;

    const [rooms] = await pool.execute('SELECT id FROM rooms WHERE room_code = ?', [roomCode]);
    if (rooms.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const [rankings] = await pool.execute(`
      SELECT 
        rm.user_id,
        u.username,
        rm.solved_count,
        rm.total_time,
        rm.competition_score,
        rm.last_ac_time
      FROM room_members rm
      LEFT JOIN users u ON rm.user_id = u.id
      WHERE rm.room_id = ?
      ORDER BY rm.competition_score DESC, rm.last_ac_time ASC
    `, [rooms[0].id]);

    res.json({
      room_code: roomCode,
      rankings
    });
  } catch (error) {
    console.error('Get room rankings error:', error);
    res.status(500).json({ error: 'Failed to get room rankings' });
  }
});

module.exports = router;
