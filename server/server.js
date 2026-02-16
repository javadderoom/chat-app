const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');

const { verifyToken, verifySocket } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const uploadRoutes = require('./routes/upload');
const messagesRoutes = require('./routes/messages');
const createChatsRouter = require('./routes/chats');
const { createSocketHandlers } = require('./socketHandlers');
const {
  testDatabaseConnection,
  runMigrations,
  ensureDefaultGlobalChat,
  pool
} = require('./startup');

const app = express();
const onlineUsers = new Map();
const uploadsDir = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');

const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.options('/{*any}', cors(corsOptions));
app.use(express.json());

app.get('/', (_req, res) => {
  res.status(200).json({ service: 'deroom-backend', status: 'ok' });
});

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/uploads', express.static(uploadsDir));
app.use('/api/upload', verifyToken, uploadRoutes);
app.use('/api', messagesRoutes);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }
});

io.use(verifySocket);
const { emitChatCreated } = createSocketHandlers(io, onlineUsers);
app.use('/api/chats', createChatsRouter(io, emitChatCreated));

const PORT = 3000;
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`Blackout Chat Server running on port ${PORT}`);

  const dbConnected = await testDatabaseConnection();
  if (!dbConnected) {
    console.error('Failed to establish database connection. Exiting...');
    process.exit(1);
  }

  await runMigrations();
  await ensureDefaultGlobalChat();
});

process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});
