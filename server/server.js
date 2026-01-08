const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const { db, pool } = require('./db/index');
const { messages } = require('./db/schema');
const { desc } = require('drizzle-orm');

const app = express();
app.use(cors());
app.use(express.json());

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
    
    // Extract and validate content - ensure it's always a non-empty string
    let content = '';
    if (data.text && typeof data.text === 'string') {
      content = data.text.trim();
    } else if (data.content && typeof data.content === 'string') {
      content = data.content.trim();
    } else if (data.message && typeof data.message === 'string') {
      content = data.message.trim();
    }
    
    // Ensure content is a non-empty string
    if (!content || content.length === 0) {
      console.warn('Received empty or invalid message, skipping save. Content:', content);
      console.warn('Full data object:', JSON.stringify(data));
      return;
    }

    // Final validation before database insert - ensure both are non-null strings
    const finalUsername = String(username || 'Anonymous').trim();
    const finalContent = String(content).trim();
    
    if (!finalContent || finalContent.length === 0) {
      console.error('Content validation failed before insert. Original content:', content);
      console.error('Data received:', JSON.stringify(data));
      return;
    }
    
    if (!finalUsername || finalUsername.length === 0) {
      console.error('Username validation failed before insert. Original username:', username);
      return;
    }

    // Explicit null/undefined checks
    if (finalContent === null || finalContent === undefined) {
      console.error('CRITICAL: Content is null/undefined after validation!', {
        originalContent: content,
        finalContent,
        data: JSON.stringify(data)
      });
      return;
    }
    
    if (finalUsername === null || finalUsername === undefined) {
      console.error('CRITICAL: Username is null/undefined after validation!', {
        originalUsername: username,
        finalUsername
      });
      return;
    }

    console.log('Preparing to save message:', {
      username: finalUsername,
      usernameType: typeof finalUsername,
      contentLength: finalContent.length,
      contentType: typeof finalContent,
      contentPreview: finalContent.substring(0, 50),
      isContentNull: finalContent === null,
      isContentUndefined: finalContent === undefined
    });

    try {
      // Save message to database - explicitly ensure values are strings
      const insertValues = {
        username: String(finalUsername),
        content: String(finalContent),
      };
      
      console.log('Insert values:', {
        username: insertValues.username,
        contentLength: insertValues.content.length,
        usernameIsNull: insertValues.username === null,
        contentIsNull: insertValues.content === null
      });
      
      const [savedMessage] = await db.insert(messages).values(insertValues).returning();
      
      console.log('Message saved to database:', {
        id: savedMessage.id,
        username: savedMessage.username,
        content: savedMessage.content.substring(0, 50) + (savedMessage.content.length > 50 ? '...' : '')
      });
      
      // Broadcast message to everyone (including sender for confirmation)
      io.emit('message', data);
    } catch (error) {
      console.error('Error saving message to database:', error.message);
      console.error('Message data:', { username: finalUsername, content: finalContent.substring(0, 50) });

      // Check if it's a connection error and try to reconnect
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.message.includes('connection')) {
        console.log('Database connection lost, attempting to reconnect...');
        try {
          // Test connection and retry once
          await pool.query('SELECT 1');
          console.log('Database reconnected successfully');

          // Retry the insert
          const [savedMessage] = await db.insert(messages).values(insertValues).returning();
          console.log('Message saved after reconnection:', savedMessage.id);
          io.emit('message', data);
          return;
        } catch (reconnectError) {
          console.error('Failed to reconnect to database:', reconnectError.message);
        }
      }

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