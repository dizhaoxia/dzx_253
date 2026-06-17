const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

class SocketManager {
  constructor(server) {
    this.io = new Server(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    this.roomMembers = new Map();
    this.userSocketMap = new Map();
    this.init();
  }

  init() {
    this.io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);

      socket.on('authenticate', async (data) => {
        try {
          const { token } = data;
          if (!token) {
            socket.emit('auth_error', { message: 'Token required' });
            return;
          }

          const decoded = jwt.verify(token, process.env.JWT_SECRET || 'oj_platform_secret_key_2024');
          socket.user = decoded;
          this.userSocketMap.set(decoded.id, socket.id);
          socket.emit('authenticated', { user: decoded });
          console.log(`User ${decoded.username} authenticated with socket ${socket.id}`);
        } catch (error) {
          socket.emit('auth_error', { message: 'Invalid token' });
        }
      });

      socket.on('create_room', async (data) => {
        try {
          if (!socket.user) {
            socket.emit('room_error', { message: 'Please authenticate first' });
            return;
          }

          const { name } = data;
          const roomCode = this.generateRoomCode();

          const [result] = await pool.execute(
            'INSERT INTO rooms (room_code, name, creator_id) VALUES (?, ?, ?)',
            [roomCode, name || `${socket.user.username}'s Room`, socket.user.id]
          );

          await pool.execute(
            'INSERT INTO room_members (room_id, user_id) VALUES (?, ?)',
            [result.insertId, socket.user.id]
          );

          socket.join(roomCode);

          if (!this.roomMembers.has(roomCode)) {
            this.roomMembers.set(roomCode, new Set());
          }
          this.roomMembers.get(roomCode).add(socket.user.id);

          const members = await this.getRoomMembers(result.insertId);
          socket.emit('room_created', {
            roomId: result.insertId,
            roomCode,
            name: name || `${socket.user.username}'s Room`,
            members
          });

          this.io.to(roomCode).emit('member_list', { members });
          console.log(`Room ${roomCode} created by ${socket.user.username}`);
        } catch (error) {
          console.error('Create room error:', error);
          socket.emit('room_error', { message: 'Failed to create room' });
        }
      });

      socket.on('join_room', async (data) => {
        try {
          if (!socket.user) {
            socket.emit('room_error', { message: 'Please authenticate first' });
            return;
          }

          const { roomCode } = data;
          if (!roomCode || roomCode.length !== 6) {
            socket.emit('room_error', { message: 'Invalid room code' });
            return;
          }

          const [rooms] = await pool.execute(
            'SELECT r.*, u.username as creator_name FROM rooms r LEFT JOIN users u ON r.creator_id = u.id WHERE room_code = ?',
            [roomCode]
          );

          if (rooms.length === 0) {
            socket.emit('room_error', { message: 'Room not found' });
            return;
          }

          const room = rooms[0];

          try {
            await pool.execute(
              'INSERT INTO room_members (room_id, user_id) VALUES (?, ?)',
              [room.id, socket.user.id]
            );
          } catch (e) {}

          socket.join(roomCode);

          if (!this.roomMembers.has(roomCode)) {
            this.roomMembers.set(roomCode, new Set());
          }
          this.roomMembers.get(roomCode).add(socket.user.id);

          const members = await this.getRoomMembers(room.id);

          socket.emit('room_joined', {
            roomId: room.id,
            roomCode,
            name: room.name,
            creatorName: room.creator_name,
            members
          });

          this.io.to(roomCode).emit('member_joined', {
            user: { id: socket.user.id, username: socket.user.username }
          });
          this.io.to(roomCode).emit('member_list', { members });

          const [messages] = await pool.execute(
            'SELECT rm.*, u.username FROM room_messages rm LEFT JOIN users u ON rm.user_id = u.id WHERE rm.room_id = ? ORDER BY rm.created_at DESC LIMIT 50',
            [room.id]
          );
          socket.emit('room_history', { messages: messages.reverse() });

          console.log(`User ${socket.user.username} joined room ${roomCode}`);
        } catch (error) {
          console.error('Join room error:', error);
          socket.emit('room_error', { message: 'Failed to join room' });
        }
      });

      socket.on('leave_room', async (data) => {
        try {
          if (!socket.user) return;
          const { roomCode } = data;
          await this.handleLeaveRoom(socket, roomCode);
        } catch (error) {
          console.error('Leave room error:', error);
        }
      });

      socket.on('send_message', async (data) => {
        try {
          if (!socket.user) {
            socket.emit('room_error', { message: 'Please authenticate first' });
            return;
          }

          const { roomCode, content } = data;
          if (!content || !content.trim()) return;

          const [rooms] = await pool.execute('SELECT id FROM rooms WHERE room_code = ?', [roomCode]);
          if (rooms.length === 0) return;

          const room = rooms[0];

          await pool.execute(
            'INSERT INTO room_messages (room_id, user_id, username, type, content) VALUES (?, ?, ?, ?, ?)',
            [room.id, socket.user.id, socket.user.username, 'chat', content.trim()]
          );

          const message = {
            id: Date.now(),
            user_id: socket.user.id,
            username: socket.user.username,
            type: 'chat',
            content: content.trim(),
            created_at: new Date().toISOString()
          };

          this.io.to(roomCode).emit('new_message', message);
        } catch (error) {
          console.error('Send message error:', error);
        }
      });

      socket.on('start_competition', async (data) => {
        try {
          if (!socket.user) {
            socket.emit('room_error', { message: 'Please authenticate first' });
            return;
          }

          const { roomCode, duration_minutes = 60 } = data;
          if (!roomCode) return;

          const [rooms] = await pool.execute(
            'SELECT * FROM rooms WHERE room_code = ?',
            [roomCode]
          );

          if (rooms.length === 0) {
            socket.emit('room_error', { message: 'Room not found' });
            return;
          }

          const room = rooms[0];
          if (room.creator_id !== socket.user.id && socket.user.role !== 'admin') {
            socket.emit('room_error', { message: 'Only room owner or admin can start competition' });
            return;
          }

          if (room.status === 'running') {
            socket.emit('room_error', { message: 'Competition is already running' });
            return;
          }

          const startTime = new Date();
          const endTime = new Date(startTime.getTime() + duration_minutes * 60 * 1000);

          await pool.execute(`
            UPDATE rooms 
            SET status = 'running', start_time = ?, end_time = ?, duration_minutes = ?, is_locked = 0
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

          this.io.to(roomCode).emit('competition_started', {
            room_code: roomCode,
            room_id: room.id,
            start_time: startTime,
            end_time: endTime,
            duration_minutes,
            problems,
            members
          });
        } catch (error) {
          console.error('Start competition error:', error);
          socket.emit('room_error', { message: 'Failed to start competition' });
        }
      });

      socket.on('end_competition', async (data) => {
        try {
          if (!socket.user) {
            socket.emit('room_error', { message: 'Please authenticate first' });
            return;
          }

          const { roomCode } = data;
          if (!roomCode) return;

          const [rooms] = await pool.execute(
            'SELECT * FROM rooms WHERE room_code = ?',
            [roomCode]
          );

          if (rooms.length === 0) {
            socket.emit('room_error', { message: 'Room not found' });
            return;
          }

          const room = rooms[0];
          if (room.creator_id !== socket.user.id && socket.user.role !== 'admin') {
            socket.emit('room_error', { message: 'Only room owner or admin can end competition' });
            return;
          }

          if (room.status !== 'running') {
            socket.emit('room_error', { message: 'No competition is running' });
            return;
          }

          const endTime = new Date();

          await pool.execute(`
            UPDATE rooms 
            SET status = 'ended', end_time = ?, is_locked = 1
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

          this.io.to(roomCode).emit('competition_ended', {
            room_code: roomCode,
            room_id: room.id,
            end_time: endTime,
            rankings
          });
        } catch (error) {
          console.error('End competition error:', error);
          socket.emit('room_error', { message: 'Failed to end competition' });
        }
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        if (socket.user) {
          this.userSocketMap.delete(socket.user.id);
          this.roomMembers.forEach((members, roomCode) => {
            if (members.has(socket.user.id)) {
              members.delete(socket.user.id);
              this.io.to(roomCode).emit('member_left', {
                user: { id: socket.user.id, username: socket.user.username }
              });
              this.getRoomMembersByCode(roomCode).then(members => {
                this.io.to(roomCode).emit('member_list', { members });
              });
            }
          });
        }
      });
    });
  }

  async handleLeaveRoom(socket, roomCode) {
    socket.leave(roomCode);

    if (this.roomMembers.has(roomCode)) {
      this.roomMembers.get(roomCode).delete(socket.user.id);
    }

    const [rooms] = await pool.execute('SELECT id FROM rooms WHERE room_code = ?', [roomCode]);
    if (rooms.length > 0) {
      await pool.execute('DELETE FROM room_members WHERE room_id = ? AND user_id = ?', [rooms[0].id, socket.user.id]);
      const members = await this.getRoomMembers(rooms[0].id);
      this.io.to(roomCode).emit('member_left', {
        user: { id: socket.user.id, username: socket.user.username }
      });
      this.io.to(roomCode).emit('member_list', { members });
    }

    socket.emit('room_left', { roomCode });
  }

  generateRoomCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async getRoomMembers(roomId) {
    const [members] = await pool.execute(`
      SELECT u.id, u.username, u.role, rm.joined_at
      FROM room_members rm
      LEFT JOIN users u ON rm.user_id = u.id
      WHERE rm.room_id = ?
      ORDER BY rm.joined_at ASC
    `, [roomId]);
    return members;
  }

  async getRoomMembersByCode(roomCode) {
    const [rooms] = await pool.execute('SELECT id FROM rooms WHERE room_code = ?', [roomCode]);
    if (rooms.length === 0) return [];
    return this.getRoomMembers(rooms[0].id);
  }

  broadcastToRoom(roomCode, event, data) {
    this.io.to(roomCode).emit(event, data);
  }

  broadcastToAll(event, data) {
    this.io.emit(event, data);
  }

  sendToUser(userId, event, data) {
    const socketId = this.userSocketMap.get(userId);
    if (socketId) {
      this.io.to(socketId).emit(event, data);
    }
  }

  async broadcastSolvedProblem(userId, username, problemId, problemTitle, roomCode = null) {
    const message = {
      user_id: userId,
      username,
      problem_id: problemId,
      problem_title: problemTitle,
      timestamp: new Date().toISOString()
    };

    this.broadcastToAll('global_solved', message);

    if (roomCode) {
      const [rooms] = await pool.execute('SELECT id FROM rooms WHERE room_code = ?', [roomCode]);
      if (rooms.length > 0) {
        await pool.execute(
          'INSERT INTO room_messages (room_id, user_id, username, type, content) VALUES (?, ?, ?, ?, ?)',
          [rooms[0].id, userId, username, 'solved', JSON.stringify({ problemId, problemTitle })]
        );
      }
      this.broadcastToRoom(roomCode, 'room_solved', {
        ...message,
        content: `${username} 解决了第 ${problemId} 题`
      });
    }
  }
}

let socketManager = null;

const initSocketManager = (server) => {
  socketManager = new SocketManager(server);
  return socketManager;
};

const getSocketManager = () => socketManager;

module.exports = { initSocketManager, getSocketManager };
