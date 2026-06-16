require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { initDatabase } = require('./config/db');
const { initRedis } = require('./config/redis');
const { initSocketManager } = require('./realTime/socketManager');

const authRoutes = require('./routes/auth');
const problemRoutes = require('./routes/problems');
const submissionRoutes = require('./routes/submissions');
const rankingRoutes = require('./routes/rankings');
const roomRoutes = require('./routes/rooms');

const app = express();
const PORT = process.env.PORT || 3434;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/problems', problemRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/rankings', rankingRoutes);
app.use('/api/rooms', roomRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'OJ Platform Backend is running' });
});

const startServer = async () => {
  try {
    await initDatabase();
    await initRedis();

    const server = http.createServer(app);
    initSocketManager(server);

    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
