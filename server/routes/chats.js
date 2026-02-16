const express = require('express');
const { db } = require('../db/index');
const { chats, chatMembers, users, messages } = require('../db/schema');
const { eq, and, inArray } = require('drizzle-orm');
const { verifyToken } = require('../middleware/auth');

async function getPinnedMessagesForChats(chatList) {
  const chatsWithPinned = (chatList || []).filter(chat => chat?.id && chat?.pinnedMessageId);
  if (chatsWithPinned.length === 0) return new Map();

  const chatIds = chatsWithPinned.map(chat => chat.id);
  const pinnedMessageIds = Array.from(new Set(chatsWithPinned.map(chat => chat.pinnedMessageId)));

  const rows = await db
    .select({
      id: messages.id,
      chatId: messages.chatId,
      userId: messages.userId,
      username: messages.username,
      displayName: users.displayName,
      content: messages.content,
      messageType: messages.messageType,
      mediaUrl: messages.mediaUrl,
      stickerId: messages.stickerId,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .leftJoin(users, eq(messages.userId, users.id))
    .where(and(
      inArray(messages.id, pinnedMessageIds),
      inArray(messages.chatId, chatIds),
      eq(messages.isDeleted, false)
    ));

  const pinnedByChatId = new Map();
  for (const row of rows) {
    pinnedByChatId.set(row.chatId, {
      id: row.id,
      chatId: row.chatId,
      userId: row.userId,
      sender: row.username,
      displayName: row.displayName || row.username,
      text: row.content || '',
      messageType: row.messageType,
      mediaUrl: row.mediaUrl,
      stickerId: row.stickerId,
      timestamp: row.createdAt,
    });
  }

  return pinnedByChatId;
}

function createChatsRouter(io, emitChatCreated) {
  const router = express.Router();

  router.get('/', verifyToken, async (req, res) => {
    try {
      const userId = req.userId;

      const userChats = await db
        .select({
          chat: chats,
          member: chatMembers
        })
        .from(chatMembers)
        .innerJoin(chats, eq(chats.id, chatMembers.chatId))
        .where(eq(chatMembers.userId, userId));

      const publicChats = await db
        .select()
        .from(chats)
        .where(eq(chats.isPrivate, false));

      const memberChats = userChats.map(({ chat }) => chat);
      const allChats = [...memberChats, ...publicChats];
      const uniqueChats = Array.from(new Map(allChats.map(c => [c.id, c])).values());

      const sortedChats = uniqueChats.sort((a, b) =>
        new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
      );

      const pinnedByChatId = await getPinnedMessagesForChats(sortedChats);
      const result = sortedChats.map((chat) => ({
        ...chat,
        pinnedMessage: pinnedByChatId.get(chat.id) || null
      }));

      res.json(result);
    } catch (error) {
      console.error('Error fetching chats:', error);
      res.status(500).json({ error: 'Failed to fetch chats' });
    }
  });

  router.get('/:chatId/members', verifyToken, async (req, res) => {
    try {
      const { chatId } = req.params;
      const userId = req.userId;

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

  router.post('/:chatId/members', verifyToken, async (req, res) => {
    try {
      const { chatId } = req.params;
      const { username } = req.body;
      const userId = req.userId;

      if (!username) {
        return res.status(400).json({ error: 'Username is required' });
      }

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

      const [targetUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username.toLowerCase()))
        .limit(1);

      if (!targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }

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

  router.delete('/:chatId/members/:userId', verifyToken, async (req, res) => {
    try {
      const { chatId, userId } = req.params;
      const currentUserId = req.userId;

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

      if (membership[0].role !== 'admin' && currentUserId !== userId) {
        return res.status(403).json({ error: 'Cannot remove other members' });
      }

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

  router.post('/dm', verifyToken, async (req, res) => {
    try {
      const { username } = req.body;
      const currentUserId = req.userId;

      if (!username) {
        return res.status(400).json({ error: 'Username is required' });
      }

      const [targetUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username.toLowerCase()))
        .limit(1);

      if (!targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (targetUser.id === currentUserId) {
        return res.status(400).json({ error: 'Cannot create DM with yourself' });
      }

      const currentUserChats = await db
        .select({ chatId: chatMembers.chatId })
        .from(chatMembers)
        .where(eq(chatMembers.userId, currentUserId));

      for (const { chatId } of currentUserChats) {
        const members = await db
          .select({ userId: chatMembers.userId })
          .from(chatMembers)
          .where(eq(chatMembers.chatId, chatId));

        if (members.length === 2) {
          const memberIds = members.map(m => m.userId);
          if (memberIds.includes(currentUserId) && memberIds.includes(targetUser.id)) {
            const [existingChat] = await db
              .select()
              .from(chats)
              .where(and(eq(chats.id, chatId), eq(chats.isDm, true)))
              .limit(1);
            if (existingChat) {
              return res.json(existingChat);
            }
          }
        }
      }

      const currentUsername = (await db.select().from(users).where(eq(users.id, currentUserId)).limit(1))[0].username;
      const usernames = [currentUsername, targetUser.username].sort();
      const chatName = `${usernames[0]} & ${usernames[1]}`;

      const [newChat] = await db.insert(chats).values({
        name: chatName,
        description: `DM with ${targetUser.displayName || targetUser.username}`,
        isPrivate: true,
        isDm: true
      }).returning();

      await db.insert(chatMembers).values([
        { chatId: newChat.id, userId: currentUserId, role: 'admin' },
        { chatId: newChat.id, userId: targetUser.id, role: 'admin' }
      ]);

      if (typeof emitChatCreated === 'function') {
        emitChatCreated(newChat, [currentUserId, targetUser.id]);
      } else {
        io.emit('chatCreated', newChat);
      }
      res.json(newChat);
    } catch (error) {
      console.error('Error creating DM:', error);
      res.status(500).json({ error: 'Failed to create DM' });
    }
  });

  router.delete('/:chatId', verifyToken, async (req, res) => {
    try {
      const { chatId } = req.params;
      const userId = req.userId;

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

      if (membership[0].role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can delete the chat' });
      }

      const [chat] = await db.select().from(chats).where(eq(chats.id, chatId)).limit(1);
      if (chat && chat.name === 'Global') {
        return res.status(400).json({ error: 'Cannot delete the Global chat' });
      }

      await db.delete(chats).where(eq(chats.id, chatId));

      io.emit('chatDeleted', chatId);
      res.json({ success: true, message: 'Chat deleted' });
    } catch (error) {
      console.error('Error deleting chat:', error);
      res.status(500).json({ error: 'Failed to delete chat' });
    }
  });

  return router;
}

module.exports = createChatsRouter;
