const express = require('express');
const { db } = require('../db/index');
const { messages, users } = require('../db/schema');
const { desc, eq, and, sql, lt } = require('drizzle-orm');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

router.get('/messages', verifyToken, async (req, res) => {
  try {
    const { chatId, before, limit, q } = req.query;
    const rawLimit = Array.isArray(limit) ? limit[0] : limit;
    const rawBefore = Array.isArray(before) ? before[0] : before;
    const rawQuery = Array.isArray(q) ? q[0] : q;

    const parsedLimit = Number.parseInt(rawLimit, 10);
    const pageSize = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 100)
      : 50;

    let whereClause = eq(messages.isDeleted, false);
    if (chatId) {
      whereClause = and(eq(messages.isDeleted, false), eq(messages.chatId, chatId));
    }
    if (rawQuery && rawQuery.trim()) {
      whereClause = and(
        whereClause,
        sql`COALESCE(${messages.content}, '') ILIKE ${`%${rawQuery.trim()}%`}`
      );
    }
    if (rawBefore) {
      const beforeValue = /^\d+$/.test(rawBefore) ? Number(rawBefore) : rawBefore;
      const beforeDate = new Date(beforeValue);
      if (!Number.isNaN(beforeDate.getTime())) {
        whereClause = and(whereClause, lt(messages.createdAt, beforeDate));
      }
    }

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
      .limit(pageSize);

    res.json(recentMessages);
  } catch (error) {
    console.error('Error fetching messages:', error.message);

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.message.includes('connection')) {
      res.status(503).json({
        error: 'Database temporarily unavailable',
        retryAfter: 30
      });
    } else {
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  }
});

module.exports = router;
