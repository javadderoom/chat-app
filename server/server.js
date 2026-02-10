const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require("socket.io");
const cors = require('cors');
const { db, pool } = require('./db/index');
const { messages, chats, users } = require('./db/schema');
const { desc, eq, ne, and } = require('drizzle-orm');
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

  // Handle joining a specific chat room
  socket.on('joinChat', (chatId) => {
    if (chatId) {
      // Leave all other chat rooms first
      // Copy rooms to array to avoid mutation during iteration
      const currentRooms = Array.from(socket.rooms);
      for (const room of currentRooms) {
        if (room !== socket.id) {
          socket.leave(room);
        }
      }

      socket.join(chatId);
      console.log(`Socket ${socket.id} joined room: ${chatId}`);
    }
  });

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
        replyToId: data.replyToId || null,
        chatId: data.chatId || null, // Link to chat room
        isForwarded: data.isForwarded || false,
        forwardedFrom: data.forwardedFrom || null,
        stickerId: data.stickerId || null,
      };

      console.log('Insert values:', {
        username: insertValues.username,
        messageType: insertValues.messageType,
        contentLength: insertValues.content?.length || 0,
        mediaUrl: insertValues.mediaUrl,
      });

      const [savedMessage] = await db.insert(messages).values(insertValues).returning();

      // Update the chat's last message timestamp
      if (insertValues.chatId) {
        await db.update(chats)
          .set({ lastMessageAt: new Date() })
          .where(eq(chats.id, insertValues.chatId));
      }

      console.log('Message saved to database:', {
        id: savedMessage.id,
        username: savedMessage.username,
        messageType: savedMessage.messageType,
        hasMedia: !!savedMessage.mediaUrl,
      });

      // Broadcast message to everyone in the specific chat
      if (insertValues.chatId) {
        io.to(insertValues.chatId).emit('message', {
          ...data,
          id: savedMessage.id,
          chatId: savedMessage.chatId, // Explicitly include database chatId
          createdAt: savedMessage.createdAt,
          replyToId: savedMessage.replyToId,
          isForwarded: savedMessage.isForwarded,
          forwardedFrom: savedMessage.forwardedFrom
        });
      } else {
        // Fallback to global broadcast (legacy/system messages)
        io.emit('message', {
          ...data,
          id: savedMessage.id,
          chatId: null,
          createdAt: savedMessage.createdAt,
          replyToId: savedMessage.replyToId
        });
      }
    } catch (error) {
      console.error('Error saving message to database:', error);
      console.error('Message data:', { username, content: content.substring(0, 50) });
      // Still broadcast even if database save fails - but ONLY to the specific room
      if (data.chatId) {
        io.to(data.chatId).emit('message', data);
      } else {
        io.emit('message', data);
      }
    }
  });

  // Handle Message Edit
  socket.on('editMessage', async (data) => {
    console.log('--- DATABASE EDIT START ---');
    console.log('Received edit data:', JSON.stringify(data));
    const { id, text } = data;

    if (!id || !text) {
      console.error('Validation failed: Missing ID or Text');
      return;
    }

    try {
      console.log(`Executing update query for ID: ${id}`);
      const updateResult = await db.update(messages)
        .set({
          content: text,
          updatedAt: new Date(),
        })
        .where(eq(messages.id, id))
        .returning();

      console.log('Query result length:', updateResult.length);

      if (updateResult.length > 0) {
        const updatedMessage = updateResult[0];
        console.log('✓ Message updated in DB:', updatedMessage.id);
        // Broadcast update to all clients
        io.emit('messageUpdated', {
          id: updatedMessage.id,
          text: updatedMessage.content,
          updatedAt: updatedMessage.updatedAt,
        });
      } else {
        console.warn('⚠ No message found in DB with ID:', id);
        // If no row was updated, it means the ID was not found
        // This is the primary indicator that the client is sending a tempId instead of a UUID
      }
    } catch (error) {
      console.error('✗ CRITICAL ERROR editing message:', error);
    }
    console.log('--- DATABASE EDIT END ---');
  });

  // Handle Message Delete
  socket.on('deleteMessage', async (data) => {
    console.log('--- DATABASE DELETE START ---');
    console.log('Received delete data:', JSON.stringify(data));
    const { id } = data;

    if (!id) {
      console.error('Validation failed: Missing ID');
      return;
    }

    try {
      console.log(`Executing soft-delete query for ID: ${id}`);
      const deleteResult = await db.update(messages)
        .set({
          isDeleted: true,
          content: '', // Clear content for privacy
          mediaUrl: null, // Remove media reference
          mediaType: null,
          updatedAt: new Date(),
        })
        .where(eq(messages.id, id))
        .returning();

      console.log('Query result length:', deleteResult.length);

      if (deleteResult.length > 0) {
        const deletedMessage = deleteResult[0];
        console.log('✓ Message soft-deleted in DB:', deletedMessage.id);
        // Broadcast delete to all clients
        io.emit('messageDeleted', {
          id: deletedMessage.id,
        });
      } else {
        console.warn('⚠ No message found in DB with ID:', id);
      }
    } catch (error) {
      console.error('✗ CRITICAL ERROR deleting message:', error);
    }
    console.log('--- DATABASE DELETE END ---');
  });

  // Handle Reaction Toggle
  socket.on('toggleReaction', async (data) => {
    const { messageId, emoji, username } = data;
    if (!messageId || !emoji || !username) return;

    try {
      const result = await db.select().from(messages).where(eq(messages.id, messageId));
      if (result.length === 0) return;

      const message = result[0];
      const reactions = message.reactions || {};
      const currentReactors = reactions[emoji] || [];

      let newReactors;
      if (currentReactors.includes(username)) {
        newReactors = currentReactors.filter(u => u !== username);
      } else {
        newReactors = [...currentReactors, username];
      }

      if (newReactors.length === 0) {
        delete reactions[emoji];
      } else {
        reactions[emoji] = newReactors;
      }

      await db.update(messages)
        .set({ reactions })
        .where(eq(messages.id, messageId));

      io.emit('reactionUpdated', { messageId, reactions });
    } catch (error) {
      console.error('Error toggling reaction:', error);
    }
  });

  // Handle Chat Creation
  socket.on('createChat', async (data) => {
    const { name, description } = data;
    if (!name) return;

    try {
      const [newChat] = await db.insert(chats).values({
        name,
        description: description || null
      }).returning();

      console.log('New chat created:', newChat.id);
      io.emit('chatCreated', newChat);
    } catch (error) {
      console.error('Error creating chat:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// Example API endpoint to get recent messages
app.get('/api/messages', async (req, res) => {
  try {
    const { chatId } = req.query;

    let whereClause = eq(messages.isDeleted, false);
    if (chatId) {
      whereClause = and(eq(messages.isDeleted, false), eq(messages.chatId, chatId));
    }

    const query = db.select().from(messages).where(whereClause);

    const recentMessages = await query
      .orderBy(desc(messages.createdAt))
      .limit(50);
    console.log(recentMessages)
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

// API endpoint to get all chats
app.get('/api/chats', async (req, res) => {
  try {
    const allChats = await db.select().from(chats).orderBy(desc(chats.lastMessageAt));
    res.json(allChats);
  } catch (error) {
    console.error('Error fetching chats:', error);
    res.status(500).json({ error: 'Failed to fetch chats' });
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

  // Ensure default Global chat exists
  try {
    const existingChats = await db.select().from(chats).limit(1);
    if (existingChats.length === 0) {
      console.log('Creating default Global chat...');
      await db.insert(chats).values({
        name: 'Global',
        description: 'The combined frequency of all transmissions.'
      });
    }
  } catch (error) {
    console.warn('Could not create default chat. It might already exist or table not ready.', error.message);
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