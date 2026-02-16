const { db, pool } = require('./db/index');
const { messages, chats, users, chatMembers } = require('./db/schema');
const { eq, and } = require('drizzle-orm');

function createSocketHandlers(io, onlineUsers) {
  async function getReceiptAggregates(messageIds = []) {
    if (!messageIds.length) return new Map();

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

    const result = new Map();
    for (const row of rows) {
      result.set(row.messageId, {
        deliveredCount: row.deliveredCount || 0,
        seenCount: row.seenCount || 0,
        seenBy: row.seenBy || []
      });
    }
    return result;
  }

  async function emitReceiptUpdates(chatId, messageIds = []) {
    if (!chatId || !messageIds.length) return;
    const uniqueIds = Array.from(new Set(messageIds));
    const receiptMap = await getReceiptAggregates(uniqueIds);

    for (const messageId of uniqueIds) {
      const aggregate = receiptMap.get(messageId) || {
        deliveredCount: 0,
        seenCount: 0,
        seenBy: []
      };
      io.to(chatId).emit('messageReceiptUpdated', {
        messageId,
        ...aggregate
      });
    }
  }

  async function upsertReceiptsForMessages({ targetUserIds = [], messageIds = [], markSeen = false }) {
    const users = Array.from(new Set((targetUserIds || []).filter(Boolean)));
    const ids = Array.from(new Set((messageIds || []).filter(Boolean)));
    if (!users.length || !ids.length) return [];

    const { rows } = await pool.query(
      `
      INSERT INTO message_receipts (message_id, user_id, delivered_at, seen_at, updated_at)
      SELECT m.id, u.user_id, NOW(), CASE WHEN $3::boolean THEN NOW() ELSE NULL END, NOW()
      FROM unnest($1::uuid[]) AS m(id)
      CROSS JOIN unnest($2::uuid[]) AS u(user_id)
      ON CONFLICT (message_id, user_id)
      DO UPDATE SET
        delivered_at = COALESCE(message_receipts.delivered_at, EXCLUDED.delivered_at),
        seen_at = CASE
          WHEN $3::boolean THEN COALESCE(message_receipts.seen_at, EXCLUDED.seen_at)
          ELSE message_receipts.seen_at
        END,
        updated_at = NOW()
      RETURNING message_id AS "messageId"
      `,
      [ids, users, !!markSeen]
    );

    return rows.map(row => row.messageId);
  }

  async function markChatReceipts({ chatId, userId, markSeen }) {
    if (!chatId || !userId) return [];

    const { rows } = await pool.query(
      `
      SELECT id
      FROM messages
      WHERE chat_id = $1
        AND is_deleted = false
        AND user_id <> $2
      `,
      [chatId, userId]
    );
    const messageIds = rows.map(r => r.id);
    if (!messageIds.length) return [];

    return upsertReceiptsForMessages({
      targetUserIds: [userId],
      messageIds,
      markSeen
    });
  }

  function emitChatCreated(chat, memberUserIds = []) {
    if (!chat) return;

    if (!chat.isPrivate) {
      io.emit('chatCreated', chat);
      return;
    }

    const uniqueMemberIds = Array.from(new Set(memberUserIds.filter(Boolean)));
    for (const memberUserId of uniqueMemberIds) {
      const socketId = onlineUsers.get(memberUserId);
      if (socketId) {
        io.to(socketId).emit('chatCreated', chat);
      }
    }
  }

  async function getPinnedMessage(chatId, pinnedMessageId) {
    if (!chatId || !pinnedMessageId) return null;

    const result = await db
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
        eq(messages.id, pinnedMessageId),
        eq(messages.chatId, chatId),
        eq(messages.isDeleted, false)
      ))
      .limit(1);

    if (result.length === 0) return null;

    const pinned = result[0];
    return {
      id: pinned.id,
      chatId: pinned.chatId,
      userId: pinned.userId,
      sender: pinned.username,
      displayName: pinned.displayName || pinned.username,
      text: pinned.content || '',
      messageType: pinned.messageType,
      mediaUrl: pinned.mediaUrl,
      stickerId: pinned.stickerId,
      timestamp: pinned.createdAt,
    };
  }

  io.on('connection', (socket) => {
    const userId = socket.userId;
    const username = socket.user?.username;
    const displayName = socket.user?.displayName || username;

    console.log(`User connected: ${username} (${socket.id})`);
    onlineUsers.set(userId, socket.id);

    socket.on('joinChat', async (chatId) => {
      if (chatId) {
        const currentRooms = Array.from(socket.rooms);
        for (const room of currentRooms) {
          if (room !== socket.id) {
            socket.leave(room);
          }
        }

        const existingMember = await db
          .select()
          .from(chatMembers)
          .where(and(
            eq(chatMembers.chatId, chatId),
            eq(chatMembers.userId, userId)
          ))
          .limit(1);

        if (existingMember.length === 0) {
          const [chat] = await db
            .select()
            .from(chats)
            .where(eq(chats.id, chatId))
            .limit(1);

          if (chat && !chat.isPrivate) {
            await db.insert(chatMembers).values({
              chatId,
              userId,
              role: 'member'
            });
          }
        }

        socket.join(chatId);

        try {
          const changedMessageIds = await markChatReceipts({
            chatId,
            userId,
            markSeen: true
          });
          if (changedMessageIds.length > 0) {
            await emitReceiptUpdates(chatId, changedMessageIds);
          }
        } catch (error) {
          console.error('Error updating receipts on joinChat:', error);
        }
      }
    });

    socket.on('markChatSeen', async (chatId) => {
      if (!chatId || !userId) return;
      try {
        const changedMessageIds = await markChatReceipts({
          chatId,
          userId,
          markSeen: true
        });
        if (changedMessageIds.length > 0) {
          await emitReceiptUpdates(chatId, changedMessageIds);
        }
      } catch (error) {
        console.error('Error marking chat seen:', error);
      }
    });

    socket.on('typingStart', (data) => {
      const chatId = data?.chatId;
      if (!chatId || !userId) return;

      socket.to(chatId).emit('typingStarted', {
        chatId,
        userId,
        username,
        displayName
      });
    });

    socket.on('typingStop', (data) => {
      const chatId = data?.chatId;
      if (!chatId || !userId) return;

      socket.to(chatId).emit('typingStopped', {
        chatId,
        userId
      });
    });

    socket.on('message', async (data) => {
      if (!userId || !data || typeof data !== 'object') return;

      let content = '';
      if (data.text && typeof data.text === 'string') content = data.text.trim();
      else if (data.content && typeof data.content === 'string') content = data.content.trim();
      else if (data.message && typeof data.message === 'string') content = data.message.trim();

      const isMediaMessage = data.messageType && data.messageType !== 'text' && data.mediaUrl;
      if ((!content || content.length === 0) && !isMediaMessage) return;

      const finalContent = content ? String(content).trim() : null;
      if (!isMediaMessage && (!finalContent || finalContent.length === 0)) return;

      try {
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
          chatId: data.chatId || null,
          isForwarded: data.isForwarded || false,
          forwardedFrom: data.forwardedFrom || null,
          stickerId: data.stickerId || null,
        };

        const [savedMessage] = await db.insert(messages).values(insertValues).returning();

        if (insertValues.chatId) {
          await db.update(chats)
            .set({ lastMessageAt: new Date() })
            .where(eq(chats.id, insertValues.chatId));
        }

        const [user] = await db.select({ displayName: users.displayName })
          .from(users)
          .where(eq(users.id, userId));

        let receiptAggregate = {
          deliveredCount: 0,
          seenCount: 0,
          seenBy: []
        };

        if (insertValues.chatId) {
          const roomSockets = io.sockets.adapter.rooms.get(insertValues.chatId) || new Set();
          const roomUserIds = [];
          for (const socketId of roomSockets) {
            const roomSocket = io.sockets.sockets.get(socketId);
            if (!roomSocket?.userId) continue;
            if (roomSocket.userId === userId) continue;
            roomUserIds.push(roomSocket.userId);
          }

          if (roomUserIds.length > 0) {
            await upsertReceiptsForMessages({
              targetUserIds: roomUserIds,
              messageIds: [savedMessage.id],
              markSeen: true
            });
            const aggregateMap = await getReceiptAggregates([savedMessage.id]);
            receiptAggregate = aggregateMap.get(savedMessage.id) || receiptAggregate;
          }
        }

        if (insertValues.chatId) {
          socket.to(insertValues.chatId).emit('typingStopped', {
            chatId: insertValues.chatId,
            userId
          });
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
            displayName: user?.displayName || savedMessage.username,
            deliveredCount: receiptAggregate.deliveredCount,
            seenCount: receiptAggregate.seenCount,
            seenBy: receiptAggregate.seenBy
          });
        } else {
          io.emit('message', {
            ...data,
            id: savedMessage.id,
            chatId: null,
            createdAt: savedMessage.createdAt,
            replyToId: savedMessage.replyToId,
            userId: savedMessage.userId,
            username: savedMessage.username,
            displayName: user?.displayName || savedMessage.username,
            deliveredCount: receiptAggregate.deliveredCount,
            seenCount: receiptAggregate.seenCount,
            seenBy: receiptAggregate.seenBy
          });
        }
      } catch (error) {
        console.error('Error saving message to database:', error);
        if (data.chatId) io.to(data.chatId).emit('message', data);
        else io.emit('message', data);
      }
    });

    socket.on('editMessage', async (data) => {
      const { id, text } = data;
      if (!id || !text) return;

      try {
        const updateResult = await db.update(messages)
          .set({
            content: text,
            updatedAt: new Date(),
          })
          .where(eq(messages.id, id))
          .returning();

        if (updateResult.length > 0) {
          const updatedMessage = updateResult[0];
          io.emit('messageUpdated', {
            id: updatedMessage.id,
            text: updatedMessage.content,
            updatedAt: updatedMessage.updatedAt,
          });
        }
      } catch (error) {
        console.error('CRITICAL ERROR editing message:', error);
      }
    });

    socket.on('deleteMessage', async (data) => {
      const { id } = data;
      if (!id) return;

      try {
        const deleteResult = await db.update(messages)
          .set({
            isDeleted: true,
            content: '',
            mediaUrl: null,
            mediaType: null,
            updatedAt: new Date(),
          })
          .where(eq(messages.id, id))
          .returning();

        if (deleteResult.length > 0) {
          const deletedMessage = deleteResult[0];
          if (deletedMessage.chatId) {
            const pinnedChat = await db
              .select({ id: chats.id })
              .from(chats)
              .where(and(
                eq(chats.id, deletedMessage.chatId),
                eq(chats.pinnedMessageId, deletedMessage.id)
              ))
              .limit(1);

            if (pinnedChat.length > 0) {
              const [updatedChat] = await db
                .update(chats)
                .set({
                  pinnedMessageId: null,
                  pinnedByUserId: null,
                  pinnedAt: null
                })
                .where(eq(chats.id, deletedMessage.chatId))
                .returning();

              io.emit('chatPinnedUpdated', {
                chatId: deletedMessage.chatId,
                pinnedMessageId: updatedChat?.pinnedMessageId || null,
                pinnedByUserId: updatedChat?.pinnedByUserId || null,
                pinnedAt: updatedChat?.pinnedAt || null,
                pinnedMessage: null
              });
            }
          }

          io.emit('messageDeleted', {
            id: deletedMessage.id,
          });
        }
      } catch (error) {
        console.error('CRITICAL ERROR deleting message:', error);
      }
    });

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

        if (newReactors.length === 0) delete reactions[emoji];
        else reactions[emoji] = newReactors;

        await db.update(messages)
          .set({ reactions })
          .where(eq(messages.id, messageId));

        io.emit('reactionUpdated', { messageId, reactions });
      } catch (error) {
        console.error('Error toggling reaction:', error);
      }
    });

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

        await db.insert(chatMembers).values({
          chatId: newChat.id,
          userId: socket.userId,
          role: 'admin'
        });

        emitChatCreated(newChat, [socket.userId]);
      } catch (error) {
        console.error('Error creating chat:', error);
      }
    });

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

        io.emit('chatUpdated', updatedChat);
      } catch (error) {
        console.error('Error updating chat:', error);
      }
    });

    socket.on('pinMessage', async (data) => {
      const { chatId, messageId } = data || {};
      if (!chatId || !messageId || !userId) return;

      try {
        const member = await db
          .select({ id: chatMembers.id })
          .from(chatMembers)
          .where(and(
            eq(chatMembers.chatId, chatId),
            eq(chatMembers.userId, userId)
          ))
          .limit(1);

        if (member.length === 0) return;

        const targetMessage = await db
          .select({ id: messages.id })
          .from(messages)
          .where(and(
            eq(messages.id, messageId),
            eq(messages.chatId, chatId),
            eq(messages.isDeleted, false)
          ))
          .limit(1);

        if (targetMessage.length === 0) return;

        const [updatedChat] = await db
          .update(chats)
          .set({
            pinnedMessageId: messageId,
            pinnedByUserId: userId,
            pinnedAt: new Date()
          })
          .where(eq(chats.id, chatId))
          .returning();

        const pinnedMessage = await getPinnedMessage(chatId, messageId);

        io.emit('chatPinnedUpdated', {
          chatId,
          pinnedMessageId: updatedChat?.pinnedMessageId || null,
          pinnedByUserId: updatedChat?.pinnedByUserId || null,
          pinnedAt: updatedChat?.pinnedAt || null,
          pinnedMessage
        });
      } catch (error) {
        console.error('Error pinning message:', error);
      }
    });

    socket.on('unpinMessage', async (data) => {
      const { chatId } = data || {};
      if (!chatId || !userId) return;

      try {
        const member = await db
          .select({ id: chatMembers.id })
          .from(chatMembers)
          .where(and(
            eq(chatMembers.chatId, chatId),
            eq(chatMembers.userId, userId)
          ))
          .limit(1);

        if (member.length === 0) return;

        const [updatedChat] = await db
          .update(chats)
          .set({
            pinnedMessageId: null,
            pinnedByUserId: null,
            pinnedAt: null
          })
          .where(eq(chats.id, chatId))
          .returning();

        io.emit('chatPinnedUpdated', {
          chatId,
          pinnedMessageId: updatedChat?.pinnedMessageId || null,
          pinnedByUserId: updatedChat?.pinnedByUserId || null,
          pinnedAt: updatedChat?.pinnedAt || null,
          pinnedMessage: null
        });
      } catch (error) {
        console.error('Error unpinning message:', error);
      }
    });

    socket.on('disconnect', () => {
      const activeRooms = Array.from(socket.rooms).filter(room => room !== socket.id);
      for (const chatId of activeRooms) {
        socket.to(chatId).emit('typingStopped', {
          chatId,
          userId
        });
      }
      onlineUsers.delete(userId);
    });
  });

  return { emitChatCreated };
}

module.exports = {
  createSocketHandlers
};
