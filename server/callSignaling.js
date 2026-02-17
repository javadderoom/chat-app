function registerCallSignalingHandlers({ socket, io, onlineUsers, userId, username, displayName }) {
  const emitToUser = (targetUserId, eventName, payload) => {
    if (!targetUserId) return;
    const targetSocketId = onlineUsers.get(targetUserId);
    if (!targetSocketId) return;
    io.to(targetSocketId).emit(eventName, payload);
  };

  socket.on('call:start', (data = {}) => {
    const { chatId, isVideo } = data;
    if (!chatId || !userId) return;

    socket.to(chatId).emit('call:incoming', {
      chatId,
      callerId: userId,
      callerUsername: username,
      callerDisplayName: displayName,
      isVideo: !!isVideo
    });
  });

  socket.on('call:accept', (data = {}) => {
    const { chatId, callerId, isVideo } = data;
    if (!chatId || !callerId || !userId) return;

    emitToUser(callerId, 'call:accepted', {
      chatId,
      calleeId: userId,
      calleeUsername: username,
      calleeDisplayName: displayName,
      isVideo: !!isVideo
    });

    // Notify existing participants so they can establish mesh links with the new joiner.
    socket.to(chatId).emit('call:participant-joined', {
      chatId,
      joinedById: userId,
      joinedByUsername: username,
      joinedByDisplayName: displayName,
      isVideo: !!isVideo
    });
  });

  socket.on('call:decline', (data = {}) => {
    const { chatId, callerId } = data;
    if (!chatId || !callerId || !userId) return;

    emitToUser(callerId, 'call:declined', {
      chatId,
      declinedById: userId,
      declinedByUsername: username,
      declinedByDisplayName: displayName
    });
  });

  socket.on('call:offer', (data = {}) => {
    const { chatId, targetUserId, offer } = data;
    if (!chatId || !targetUserId || !offer || !userId) return;

    emitToUser(targetUserId, 'call:offer', {
      chatId,
      fromUserId: userId,
      fromUsername: username,
      fromDisplayName: displayName,
      offer
    });
  });

  socket.on('call:answer', (data = {}) => {
    const { chatId, targetUserId, answer } = data;
    if (!chatId || !targetUserId || !answer || !userId) return;

    emitToUser(targetUserId, 'call:answer', {
      chatId,
      fromUserId: userId,
      answer
    });
  });

  socket.on('call:ice', (data = {}) => {
    const { chatId, targetUserId, candidate } = data;
    if (!chatId || !targetUserId || !candidate || !userId) return;

    emitToUser(targetUserId, 'call:ice', {
      chatId,
      fromUserId: userId,
      candidate
    });
  });

  socket.on('call:end', (data = {}) => {
    const { chatId, targetUserId, reason } = data;
    if (!chatId || !userId) return;

    if (targetUserId) {
      emitToUser(targetUserId, 'call:ended', {
        chatId,
        endedById: userId,
        reason: reason || 'ended'
      });
      return;
    }

    socket.to(chatId).emit('call:ended', {
      chatId,
      endedById: userId,
      reason: reason || 'ended'
    });
  });
}

module.exports = {
  registerCallSignalingHandlers
};
