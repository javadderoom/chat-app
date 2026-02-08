const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require("socket.io");
const cors = require('cors');
const { db, pool } = require('./db/index');
const { messages } = require('./db/schema');
const { desc } = require('drizzle-orm');
const uploadRoutes = require('./routes/upload');

const app = express();
app.use(cors());
app.use(express.json());

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Upload routes
app.use('/api/upload', uploadRoutes);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow connections from any IP on LAN
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('message', async (data) => {
    console.log('Received message event from socket:', socket.id);
    console.log('Message data:', data);
    console.log('Message data types:', {
      user: typeof data?.user,
      username: typeof data?.username,
      text: typeof data?.text,
      content: typeof data?.content,
      message: typeof data?.message
    });

    // Validate data object exists
    if (!data || typeof data !== 'object') {
      console.error('Invalid message data received:', data);
      return;
    }

    // Extract and validate username - ensure it's always a non-empty string
    let username = 'Anonymous';
    if (data.user && typeof data.user === 'string') username = data.user.trim();
    else if (data.username && typeof data.username === 'string') username = data.username.trim();

    if (!username) {
      console.warn('Received message with empty username, using Anonymous');
      username = 'Anonymous';
    }

    // Extract and validate content - can be empty for media messages
    let content = '';
    if (data.text && typeof data.text === 'string') {
      content = data.text.trim();
    } else if (data.content && typeof data.content === 'string') {
      content = data.content.trim();
    } else if (data.message && typeof data.message === 'string') {
      content = data.message.trim();
    }

    // Check if this is a media message
    const isMediaMessage = data.messageType && data.messageType !== 'text' && data.mediaUrl;

    // Require either content or media
    if ((!content || content.length === 0) && !isMediaMessage) {
      console.warn('Received message with no content and no media, skipping save.');
      console.warn('Full data object:', JSON.stringify(data));
      return;
    }

    // Final validation before database insert
    const finalUsername = String(username || 'Anonymous').trim();
    const finalContent = content ? String(content).trim() : null;

    // For text messages, require content; for media messages, content is optional
    if (!isMediaMessage && (!finalContent || finalContent.length === 0)) {
      console.error('Text message validation failed - no content. Data:', JSON.stringify(data));
      return;
    }

    if (!finalUsername || finalUsername.length === 0) {
      console.error('Username validation failed before insert. Original username:', username);
      return;
    }

    console.log('Preparing to save message:', {
      username: finalUsername,
      messageType: data.messageType || 'text',
      hasContent: !!finalContent,
      hasMedia: isMediaMessage,
    });

    try {
      // Save message to database with multimedia support
      const insertValues = {
        username: String(finalUsername),
        messageType: data.messageType || 'text',
        content: finalContent || null,
        mediaUrl: data.mediaUrl || null,
        mediaType: data.mediaType || null,
        mediaDuration: data.mediaDuration || null,
        mediaThumbnail: data.mediaThumbnail || null,
        fileName: data.fileName || null,
        fileSize: data.fileSize || null,
      };

      console.log('Insert values:', {
        username: insertValues.username,
        messageType: insertValues.messageType,
        contentLength: insertValues.content?.length || 0,
        mediaUrl: insertValues.mediaUrl,
      });

      const [savedMessage] = await db.insert(messages).values(insertValues).returning();

      console.log('Message saved to database:', {
        id: savedMessage.id,
        username: savedMessage.username,
        messageType: savedMessage.messageType,
        hasMedia: !!savedMessage.mediaUrl,
      });

      // Broadcast message to everyone (including sender for confirmation)
      io.emit('message', { ...data, id: savedMessage.id, createdAt: savedMessage.createdAt });
    } catch (error) {
      console.error('Error saving message to database:', error);
      console.error('Message data:', { username, content: content.substring(0, 50) });
      // Still broadcast even if database save fails
      io.emit('message', data);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// Example API endpoint to get recent messages
app.get('/api/messages', async (req, res) => {
  try {
    const recentMessages = await db.select().from(messages).orderBy(desc(messages.createdAt)).limit(50);
    res.json(recentMessages);
  } catch (error) {
    console.error('Error fetching messages:', error.message);

    // Check if it's a connection error
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.message.includes('connection')) {
      console.log('Database connection issue in API endpoint');
      res.status(503).json({
        error: 'Database temporarily unavailable',
        retryAfter: 30
      });
    } else {
    res.status(500).json({ error: 'Failed to fetch messages' });
    }
  }
});

// Test database connection on startup with retries
async function testDatabaseConnection(maxRetries = 10, retryDelay = 5000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
  try {
      console.log(`Testing database connection (attempt ${attempt}/${maxRetries})...`);
    const result = await pool.query('SELECT NOW()');
    console.log('✓ Database connection successful');
    console.log('  Database time:', result.rows[0].now);

      // Test that tables exist by trying to count messages
      try {
        const countResult = await pool.query('SELECT COUNT(*) FROM messages');
        console.log('✓ Database tables are accessible');
        console.log('  Current message count:', countResult.rows[0].count);
      } catch (tableError) {
        console.error('✗ Database tables not found:', tableError.message);
        console.error('  Please ensure database schema is initialized');
        return false;
      }

      return true;
  } catch (error) {
      console.error(`✗ Database connection failed (attempt ${attempt}/${maxRetries}):`, error.message);

      if (attempt === maxRetries) {
        console.error('  Max retries reached. Please check:');
        console.error('  - PostgreSQL container is running');
        console.error('  - Database credentials are correct');
        console.error('  - Network connectivity between containers');
        return false;
      }

      console.log(`  Retrying in ${retryDelay / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
  }
  }
  return false;
}

const PORT = 3000;
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`Blackout Chat Server running on port ${PORT}`);

  const dbConnected = await testDatabaseConnection();
  if (!dbConnected) {
    console.error('Failed to establish database connection. Exiting...');
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  console.log("Shutting down gracefully...");
  await pool.end(); // close all DB connections
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log("Shutting down gracefully...");
  await pool.end(); // close all DB connections 
  process.exit(0);
});