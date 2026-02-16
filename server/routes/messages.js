const express = require('express');
const { db, pool } = require('../db/index');
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

    const messageIds = recentMessages.map(m => m.id);
    const receiptsByMessageId = new Map();
    if (messageIds.length > 0) {
      const { rows } = await pool.query(
        `
        SELECT
          r.message_id AS "messageId",
          COUNT(*)::int AS "deliveredCount",
          COUNT(r.seen_at)::int AS "seenCount",
          ARRAY_REMOVE(
            ARRAY_AGG(
              CASE WHEN r.seen_at IS NOT NULL THEN COALESCE(u.display_name, u.username) END
            ),
            NULL
          ) AS "seenBy"
        FROM message_receipts r
        LEFT JOIN users u ON u.id = r.user_id
        WHERE r.message_id = ANY($1::uuid[])
        GROUP BY r.message_id
        `,
        [messageIds]
      );
      for (const row of rows) {
        receiptsByMessageId.set(row.messageId, {
          deliveredCount: row.deliveredCount || 0,
          seenCount: row.seenCount || 0,
          seenBy: row.seenBy || []
        });
      }
    }

    const withReceipts = recentMessages.map(message => {
      const receipt = receiptsByMessageId.get(message.id) || {
        deliveredCount: 0,
        seenCount: 0,
        seenBy: []
      };
      return {
        ...message,
        deliveredCount: receipt.deliveredCount,
        seenCount: receipt.seenCount,
        seenBy: receipt.seenBy
      };
    });

    res.json(withReceipts);
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
