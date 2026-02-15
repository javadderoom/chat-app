const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require("socket.io");
const cors = require('cors');
const { db, pool } = require('./db/index');
const { messages, chats, users, chatMembers } = require('./db/schema');
const { desc, eq, and, or, sql, exists } = require('drizzle-orm');
const { verifyToken } = require('./middleware/auth');
const uploadRoutes = require('./routes/upload');
const authRoutes = require('./routes/auth');
const { verifySocket } = require('./middleware/auth');

// Track online users
const onlineUsers = new Map();

const app = express();
app.use(cors());
app.use(express.json());

// Auth routes (public)
app.use('/api/auth', authRoutes);

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Upload routes (protected)
app.use('/api/upload', verifyToken, uploadRoutes);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.use(verifySocket);

io.on('connection', (socket) => {
  const userId = socket.userId;
  const username = socket.user?.username;
  const displayName = socket.user?.displayName;

  console.log(`User connected: ${username} (${socket.id})`);

  // Add user to online tracking
  onlineUsers.set(userId, socket.id);
  console.log('User connected:', socket.id);

  // Handle joining a specific chat room
  socket.on('joinChat', async (chatId) => {
    if (chatId) {
      // Leave all other chat rooms first
      // Copy rooms to array to avoid mutation during iteration
      const currentRooms = Array.from(socket.rooms);
      for (const room of currentRooms) {
        if (room !== socket.id) {
          socket.leave(room);
        }
      }

      // Check if user is already a member
      const existingMember = await db
        .select()
        .from(chatMembers)
        .where(and(
          eq(chatMembers.chatId, chatId),
          eq(chatMembers.userId, userId)
        ))
        .limit(1);

      // If not a member, check if chat is public and add them
      if (existingMember.length === 0) {
        const [chat] = await db
          .select()
          .from(chats)
          .where(eq(chats.id, chatId))
          .limit(1);

        if (chat && !chat.isPrivate) {
          // Auto-add to public chat
          await db.insert(chatMembers).values({
            chatId,
            userId,
            role: 'member'
          });
          console.log(`Auto-added user ${username} to public chat ${chatId}`);
        }
      }

      socket.join(chatId);
      console.log(`Socket ${socket.id} joined room: ${chatId}`);
    }
  });

  socket.on('message', async (data) => {
    console.log(`Received message from ${username}:`, data);

    if (!userId) {
      console.error('Unauthorized message attempt');
      return;
    }

    // Validate data object exists
    if (!data || typeof data !== 'object') {
      console.error('Invalid message data received:', data);
      return;
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
    const finalContent = content ? String(content).trim() : null;

    // For text messages, require content; for media messages, content is optional
    if (!isMediaMessage && (!finalContent || finalContent.length === 0)) {
      console.error('Text message validation failed - no content. Data:', JSON.stringify(data));
      return;
    }

    console.log('Preparing to save message:', {
      username: username,
      messageType: data.messageType || 'text',
      hasContent: !!finalContent,
      hasMedia: isMediaMessage,
    });

    try {
      // Save message to database with multimedia support
      const insertValues = {
        userId: userId,
        username: username,
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
        userId: insertValues.userId,
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

      // Get user's displayName for broadcasting
      const [user] = await db.select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, userId));

      console.log('Message saved to database:', {
        id: savedMessage.id,
        username: savedMessage.username,
        displayName: user?.displayName,
        messageType: savedMessage.messageType,
        hasMedia: !!savedMessage.mediaUrl,
      });

      // Broadcast message to everyone in the specific chat
      if (insertValues.chatId) {
        io.to(insertValues.chatId).emit('message', {
          ...data,
          id: savedMessage.id,
          chatId: savedMessage.chatId,
          createdAt: savedMessage.createdAt,
          replyToId: savedMessage.replyToId,
          isForwarded: savedMessage.isForwarded,
          forwardedFrom: savedMessage.forwardedFrom,
          userId: savedMessage.userId,
          username: savedMessage.username,
          displayName: user?.displayName || savedMessage.username
        });
      } else {
        // Fallback to global broadcast (legacy/system messages)
        io.emit('message', {
          ...data,
          id: savedMessage.id,
          chatId: null,
          createdAt: savedMessage.createdAt,
          replyToId: savedMessage.replyToId,
          userId: savedMessage.userId,
          username: savedMessage.username,
          displayName: user?.displayName || savedMessage.username
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
    const { name, description, imageUrl, isPrivate } = data;
    if (!name) return;

    try {
      const [newChat] = await db.insert(chats).values({
        name,
        description: description || null,
        imageUrl: imageUrl || null,
        isPrivate: isPrivate || false
      }).returning();

      // Add creator as admin member
      await db.insert(chatMembers).values({
        chatId: newChat.id,
        userId: socket.userId,
        role: 'admin'
      });

      console.log('New chat created:', newChat.id);
      io.emit('chatCreated', newChat);
    } catch (error) {
      console.error('Error creating chat:', error);
    }
  });

  // Handle Chat Update
  socket.on('updateChat', async (data) => {
    const { id, name, description, imageUrl } = data;
    if (!id) return;

    try {
      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (imageUrl !== undefined) updateData.imageUrl = imageUrl;

      if (Object.keys(updateData).length === 0) return;

      const [updatedChat] = await db.update(chats)
        .set(updateData)
        .where(eq(chats.id, id))
        .returning();

      console.log('Chat updated:', updatedChat.id);
      io.emit('chatUpdated', updatedChat);
    } catch (error) {
      console.error('Error updating chat:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${username} (${socket.id})`);
    onlineUsers.delete(userId);
  });
});

// Example API endpoint to get recent messages (protected)
app.get('/api/messages', verifyToken, async (req, res) => {
  try {
    const { chatId } = req.query;

    let whereClause = eq(messages.isDeleted, false);
    if (chatId) {
      whereClause = and(eq(messages.isDeleted, false), eq(messages.chatId, chatId));
    }

    // Join messages with users to get display names
    const recentMessages = await db
      .select({
        id: messages.id,
        chatId: messages.chatId,
        userId: messages.userId,
        username: messages.username,
        messageType: messages.messageType,
        content: messages.content,
        mediaUrl: messages.mediaUrl,
        mediaType: messages.mediaType,
        mediaDuration: messages.mediaDuration,
        mediaThumbnail: messages.mediaThumbnail,
        fileName: messages.fileName,
        fileSize: messages.fileSize,
        isDeleted: messages.isDeleted,
        replyToId: messages.replyToId,
        reactions: messages.reactions,
        isForwarded: messages.isForwarded,
        forwardedFrom: messages.forwardedFrom,
        stickerId: messages.stickerId,
        updatedAt: messages.updatedAt,
        createdAt: messages.createdAt,
        displayName: users.displayName
      })
      .from(messages)
      .leftJoin(users, eq(messages.userId, users.id))
      .where(whereClause)
      .orderBy(desc(messages.createdAt))
      .limit(50);

    console.log(recentMessages);
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

// API endpoint to get chats for current user (protected)
app.get('/api/chats', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    
    // Get chats where user is a member OR chat is not private
    const userChats = await db
      .select({
        chat: chats,
        member: chatMembers
      })
      .from(chatMembers)
      .innerJoin(chats, eq(chats.id, chatMembers.chatId))
      .where(eq(chatMembers.userId, userId));
    
    // Also get non-private chats
    const publicChats = await db
      .select()
      .from(chats)
      .where(eq(chats.isPrivate, false));
    
    // Combine and remove duplicates
    const memberChats = userChats.map(({ chat }) => chat);
    const allChats = [...memberChats, ...publicChats];
    const uniqueChats = Array.from(new Map(allChats.map(c => [c.id, c])).values());
    
    // Sort by lastMessageAt
    const result = uniqueChats.sort((a, b) => 
      new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    );
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching chats:', error);
    res.status(500).json({ error: 'Failed to fetch chats' });
  }
});

// API endpoint to get chat members
app.get('/api/chats/:chatId/members', verifyToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.userId;

    // Check if user is a member of this chat
    const membership = await db
      .select()
      .from(chatMembers)
      .where(and(
        eq(chatMembers.chatId, chatId),
        eq(chatMembers.userId, userId)
      ))
      .limit(1);

    if (membership.length === 0) {
      return res.status(403).json({ error: 'Not a member of this chat' });
    }

    // Get all members
    const members = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: chatMembers.role,
        joinedAt: chatMembers.joinedAt
      })
      .from(chatMembers)
      .innerJoin(users, eq(users.id, chatMembers.userId))
      .where(eq(chatMembers.chatId, chatId));

    res.json(members);
  } catch (error) {
    console.error('Error fetching chat members:', error);
    res.status(500).json({ error: 'Failed to fetch chat members' });
  }
});

// API endpoint to add member to chat
app.post('/api/chats/:chatId/members', verifyToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { username } = req.body;
    const userId = req.userId;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Check if current user is admin of this chat
    const membership = await db
      .select()
      .from(chatMembers)
      .where(and(
        eq(chatMembers.chatId, chatId),
        eq(chatMembers.userId, userId),
        eq(chatMembers.role, 'admin')
      ))
      .limit(1);

    if (membership.length === 0) {
      return res.status(403).json({ error: 'Only admins can add members' });
    }

    // Find user to add
    const [targetUser] = await db
      .select()
      .from(users)
      .where(eq(users.username, username.toLowerCase()))
      .limit(1);

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if already a member
    const existingMember = await db
      .select()
      .from(chatMembers)
      .where(and(
        eq(chatMembers.chatId, chatId),
        eq(chatMembers.userId, targetUser.id)
      ))
      .limit(1);

    if (existingMember.length > 0) {
      return res.status(400).json({ error: 'User is already a member' });
    }

    // Add user to chat
    await db.insert(chatMembers).values({
      chatId,
      userId: targetUser.id,
      role: 'member'
    });

    res.json({ success: true, message: 'User added to chat' });
  } catch (error) {
    console.error('Error adding chat member:', error);
    res.status(500).json({ error: 'Failed to add chat member' });
  }
});

// API endpoint to remove member from chat
app.delete('/api/chats/:chatId/members/:userId', verifyToken, async (req, res) => {
  try {
    const { chatId, userId } = req.params;
    const currentUserId = req.userId;

    // Check if current user is admin or removing themselves
    const membership = await db
      .select()
      .from(chatMembers)
      .where(and(
        eq(chatMembers.chatId, chatId),
        eq(chatMembers.userId, currentUserId)
      ))
      .limit(1);

    if (membership.length === 0) {
      return res.status(403).json({ error: 'Not a member of this chat' });
    }

    // Only admins can remove others, users can remove themselves
    if (membership[0].role !== 'admin' && currentUserId !== userId) {
      return res.status(403).json({ error: 'Cannot remove other members' });
    }

    // Cannot remove admin
    const [targetMember] = await db
      .select()
      .from(chatMembers)
      .where(and(
        eq(chatMembers.chatId, chatId),
        eq(chatMembers.userId, userId)
      ))
      .limit(1);

    if (targetMember?.role === 'admin') {
      return res.status(403).json({ error: 'Cannot remove admin' });
    }

    await db
      .delete(chatMembers)
      .where(and(
        eq(chatMembers.chatId, chatId),
        eq(chatMembers.userId, userId)
      ));

    res.json({ success: true, message: 'User removed from chat' });
  } catch (error) {
    console.error('Error removing chat member:', error);
    res.status(500).json({ error: 'Failed to remove chat member' });
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

  // Run migrations
  try {
    console.log('Running database migrations...');
    
    // Add is_private column if not exists
    await pool.query(`
      ALTER TABLE chats ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false NOT NULL
    `).catch(() => {}); // Ignore if already exists
    
    // Create chat_members table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        chat_id UUID REFERENCES chats(id) ON DELETE CASCADE NOT NULL,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        role VARCHAR(20) DEFAULT 'member' NOT NULL,
        joined_at TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE(chat_id, user_id)
      )
    `).catch(() => {}); // Ignore if already exists
    
    // Create indexes if not exists
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_members_chat_id ON chat_members(chat_id)
    `).catch(() => {});
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_members_user_id ON chat_members(user_id)
    `).catch(() => {});
    
    console.log('Migrations completed');
  } catch (error) {
    console.warn('Migration warning:', error.message);
  }

  // Ensure default Global chat exists
  try {
    const existingChats = await db.select().from(chats).limit(1);
    if (existingChats.length === 0) {
      console.log('Creating default Global chat...');
      const [newChat] = await db.insert(chats).values({
        name: 'Global',
        description: 'The combined frequency of all transmissions.'
      }).returning();
      
      // Get all users and add them as members
      const allUsers = await db.select().from(users);
      for (const user of allUsers) {
        await db.insert(chatMembers).values({
          chatId: newChat.id,
          userId: user.id,
          role: 'admin'
        }).catch(() => {}); // Ignore duplicates
      }
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