import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Message, ConnectionStatus, UserSettings, Chat } from '../types';

// Database message format from API
interface DbMessage {
  id: string;
  username: string;
  content: string;
  createdAt: string | Date;
  messageType: string;
  mediaUrl?: string;
  mediaType?: string;
  mediaDuration?: number;
  fileName?: string;
  fileSize?: number;
  replyToId?: string;
  chatId?: string;
  reactions?: Record<string, string[]>;
  isForwarded?: boolean;
  forwardedFrom?: string;
}

// Demo messages for simulation mode
const DEMO_RESPONSES = [
  "Roger that. Signal is clear.",
  "Interference detected in sector 7.",
  "Copy. Holding position.",
  "Network check: latency 4ms.",
  "System optimal.",
  "Did you catch the broadcast?",
  "Keep the channel open.",
];

export const useChatConnection = (settings: UserSettings) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [socket, setSocket] = useState<Socket | null>(null);

  // Use a ref for settings to access latest values in effects without re-triggering connection
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Fetch all available chats
  const fetchChats = useCallback(async () => {
    try {
      const response = await fetch(`${settings.serverUrl}/api/chats`);
      if (response.ok) {
        const data: Chat[] = await response.json();
        setChats(data);

        // Auto-select first chat (e.g. Global) if none selected
        if (data.length > 0 && !activeChatId) {
          setActiveChatId(data[0].id);
        }
      }
    } catch (error) {
      console.error('Error fetching chats:', error);
    }
  }, [settings.serverUrl, activeChatId]);

  useEffect(() => {
    if (status === ConnectionStatus.CONNECTED) {
      fetchChats();
    }
  }, [status, fetchChats]);

  const addMessage = useCallback((text: string, sender: string, isMe: boolean = false, isSystem: boolean = false, replyToId?: string) => {
    const id = Math.random().toString(36).substring(7);
    const newMessage: Message = {
      id,
      text,
      sender,
      timestamp: Date.now(),
      isMe,
      isSystem,
      replyToId
    };
    setMessages(prev => [...prev, newMessage]);
    return id;
  }, []);

  // Initialize connection
  useEffect(() => {
    if (settings.isDemoMode) {
      setStatus(ConnectionStatus.CONNECTED);
      addMessage("Demo Mode Active. Messages are simulated.", "System", false, true);
      return;
    }

    setStatus(ConnectionStatus.CONNECTING);

    // Attempt connection
    const newSocket = io(settings.serverUrl, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000, // Increased timeout for slow LANs
      transports: ['polling', 'websocket'], // Enable polling fallback to fix "websocket error"
      forceNew: true // Ensure a fresh connection instance
    });

    newSocket.on('connect', () => {
      console.log('Socket.io connected!', { socketId: newSocket.id, serverUrl: settings.serverUrl });
      setStatus(ConnectionStatus.CONNECTED);

      // Show connection message
      addMessage(`Connected to ${settings.serverUrl}`, "System", false, true);

      // Join current active chat if available
      if (activeChatIdRef.current) {
        newSocket.emit('joinChat', activeChatIdRef.current);
      }

      // Join a default room or announce presence
      newSocket.emit('join', settings.username);
    });

    newSocket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
      console.error('Connection details:', { serverUrl: settings.serverUrl, error: err });
      // Update status to ERROR to inform UI, but socket will keep retrying due to reconnection: true
      setStatus(ConnectionStatus.ERROR);
    });

    newSocket.on('disconnect', (reason) => {
      setStatus(ConnectionStatus.DISCONNECTED);
      addMessage(`Disconnected: ${reason}`, "System", false, true);
    });

    newSocket.on('message', (data: {
      id?: string;
      tempId?: string;
      user?: string;
      username?: string;
      text: string;
      createdAt?: string;
      messageType?: string;
      mediaUrl?: string;
      mediaType?: string;
      mediaDuration?: number;
      fileName?: string;
      fileSize?: number;
      replyToId?: string;
      chatId?: string;
      isForwarded?: boolean;
      forwardedFrom?: string;
    }) => {
      const senderName = (data.user || data.username || '').trim().toLowerCase();
      const currentUserName = (settingsRef.current.username || '').trim().toLowerCase();
      const isFromMe = senderName === currentUserName;

      // Robust synchronization: check isFromMe OR tempId match
      const isOptimisticMatch = data.tempId ? true : false;

      // Client-side isolation check: ignore synchronization for other chats
      if (data.chatId && activeChatIdRef.current && data.chatId !== activeChatIdRef.current) {
        console.log('Ignored message confirm for different chat:', data.chatId);
        return;
      }

      if (data.tempId || isFromMe) {
        let matched = false;
        setMessages(prev => prev.map(msg => {
          if (msg.id === data.tempId || (isFromMe && msg.text === data.text && !msg.id.includes('-'))) {
            matched = true;
            return {
              ...msg,
              id: data.id!,
              timestamp: data.createdAt ? new Date(data.createdAt).getTime() : msg.timestamp,
              replyToId: data.replyToId
            };
          }
          return msg;
        }));

        // If we synced an optimistic message, we're done with this event
        if (matched) return;
      }

      const currentTime = Date.now();

      setMessages(prev => {
        // Prevent duplicates for all messages by checking ID
        if (data.id && prev.some(m => m.id === data.id)) return prev;

        // Check for duplicate content from same user within a short window (content-based fallback)
        const recentTime = currentTime - 10000; // 10 second window
        const duplicate = prev.find(
          msg => msg.text === data.text &&
            msg.sender === (data.user || data.username) &&
            msg.timestamp > recentTime &&
            !msg.isSystem
        );

        if (duplicate) {
          return prev;
        }

        // Add new message from other users
        // Client-side isolation check: ignore messages not for this chat
        if (data.chatId && activeChatIdRef.current && data.chatId !== activeChatIdRef.current) {
          console.log('Ignored message for different chat:', data.chatId);
          return prev;
        }

        const newMessage: Message = {
          id: data.id || Math.random().toString(36).substring(7), // Use server ID if available
          text: data.text,
          sender: data.user || data.username,
          timestamp: data.createdAt ? new Date(data.createdAt).getTime() : currentTime,
          isMe: false,
          isSystem: false,
          // Include media fields
          messageType: data.messageType as any,
          mediaUrl: data.mediaUrl,
          mediaType: data.mediaType,
          mediaDuration: data.mediaDuration,
          fileName: data.fileName,
          fileSize: data.fileSize,
          replyToId: data.replyToId,
          chatId: data.chatId,
          isForwarded: data.isForwarded,
          forwardedFrom: data.forwardedFrom
        };
        return [...prev, newMessage];
      });
    });

    // Handle initial connect - request users list or message history if needed
    newSocket.on('messageUpdated', (data: { id: string, text: string, updatedAt: string }) => {
      setMessages(prev => prev.map(msg =>
        msg.id === data.id
          ? { ...msg, text: data.text, updatedAt: new Date(data.updatedAt).getTime() }
          : msg
      ));
    });

    newSocket.on('messageDeleted', (data: { id: string }) => {
      setMessages(prev => prev.filter(msg => msg.id !== data.id));
    });

    newSocket.on('reactionUpdated', (data: { messageId: string, reactions: Record<string, string[]> }) => {
      setMessages(prev => prev.map(msg =>
        msg.id === data.messageId
          ? { ...msg, reactions: data.reactions }
          : msg
      ));
    });

    newSocket.on('chatCreated', (newChat: Chat) => {
      setChats(prev => [newChat, ...prev]);
    });

    setSocket(newSocket);

    return () => {
      newSocket.removeAllListeners();
      newSocket.disconnect();
    };
  }, [settings.serverUrl, settings.isDemoMode, settings.username, addMessage]);

  // Handle active chat changes (Fetch history & Join room)
  const activeChatIdRef = useRef(activeChatId);
  useEffect(() => {
    activeChatIdRef.current = activeChatId;

    if (status !== ConnectionStatus.CONNECTED || settings.isDemoMode) return;

    const loadHistory = async () => {
      if (!activeChatId) return;

      // Clear current messages to prevent bleed-over
      setMessages([]);

      try {
        console.log(`Loading history for chat: ${activeChatId}`);
        const response = await fetch(`${settings.serverUrl}/api/messages?chatId=${activeChatId}`);
        if (response.ok) {
          const dbMessages: DbMessage[] = await response.json();
          const loadedMessages: Message[] = dbMessages
            .reverse()
            .map((dbMsg) => ({
              id: dbMsg.id,
              text: dbMsg.content,
              sender: dbMsg.username,
              timestamp: new Date(dbMsg.createdAt).getTime(),
              isMe: dbMsg.username === settings.username,
              isSystem: false,
              messageType: dbMsg.messageType as any,
              mediaUrl: dbMsg.mediaUrl,
              mediaType: dbMsg.mediaType,
              mediaDuration: dbMsg.mediaDuration,
              fileName: dbMsg.fileName,
              fileSize: dbMsg.fileSize,
              replyToId: dbMsg.replyToId,
              chatId: dbMsg.chatId,
              reactions: dbMsg.reactions || {},
              isForwarded: dbMsg.isForwarded,
              forwardedFrom: dbMsg.forwardedFrom
            }));
          setMessages(loadedMessages);
        }
      } catch (error) {
        console.error('Error loading messages:', error);
      }
    };

    loadHistory();

    // Re-join the correct socket.io room
    if (socket && socket.connected && activeChatId) {
      socket.emit('joinChat', activeChatId);
    }
  }, [activeChatId, status, socket, settings.serverUrl, settings.isDemoMode, settings.username]);

  const sendMessage = useCallback((text: string, replyToId?: string) => {
    // Validate and sanitize input
    if (!text || typeof text !== 'string') {
      console.warn('Invalid message text:', text);
      return;
    }

    const trimmedText = text.trim();
    if (!trimmedText) {
      return;
    }

    // Ensure username is valid
    const username = settingsRef.current.username?.trim() || 'Anonymous';
    if (!username) {
      console.warn('Invalid username, cannot send message');
      return;
    }

    // Add local message immediately for optimistic UI
    const tempId = addMessage(trimmedText, username, true, false, replyToId);

    if (settingsRef.current.isDemoMode) {
      // Simulate reply in demo mode
      setTimeout(() => {
        const randomResponse = DEMO_RESPONSES[Math.floor(Math.random() * DEMO_RESPONSES.length)];
        addMessage(randomResponse, "Operator", false);
      }, 1000 + Math.random() * 2000);
    } else if (socket && socket.connected) {
      // Send to server - ensure both fields are strings and non-empty
      const messageData = {
        user: String(username),
        text: String(trimmedText),
        tempId: tempId,
        replyToId: replyToId,
        chatId: activeChatId || undefined
      };

      // Double-check before sending
      if (!messageData.text || !messageData.user) {
        console.error('Invalid message data, not sending:', messageData);
        addMessage("Error: Invalid message format", "System", false, true);
        return;
      }

      console.log('Sending message via Socket.io:', messageData);
      console.log('Socket connected:', socket.connected);
      console.log('Socket ID:', socket.id);
      socket.emit('message', messageData);
    } else {
      // Fallback if disconnected
      console.warn('Cannot send message - socket not connected', {
        socketExists: !!socket,
        socketConnected: socket?.connected,
        status
      });
      addMessage("Message not sent: Disconnected", "System", false, true);
    }
  }, [socket, addMessage, status, activeChatId]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  // Send media message (image, video, audio)
  const sendMediaMessage = useCallback((uploadData: {
    messageType: 'image' | 'video' | 'audio';
    mediaUrl: string;
    mediaType: string;
    fileName: string;
    fileSize: number;
    mediaDuration?: number;
  }, replyToId?: string, caption?: string) => {
    const username = settingsRef.current.username?.trim() || 'Anonymous';
    const messageText = caption || `[${uploadData.messageType.toUpperCase()}] ${uploadData.fileName}`;

    // Add local message immediately for optimistic UI
    const tempId = Math.random().toString(36).substring(7);
    const localMessage: Message = {
      id: tempId,
      text: messageText,
      sender: username,
      timestamp: Date.now(),
      isMe: true,
      isSystem: false,
      messageType: uploadData.messageType,
      mediaUrl: uploadData.mediaUrl,
      mediaType: uploadData.mediaType,
      fileName: uploadData.fileName,
      fileSize: uploadData.fileSize,
      mediaDuration: uploadData.mediaDuration,
      replyToId: replyToId
    };
    setMessages(prev => [...prev, localMessage]);

    if (settingsRef.current.isDemoMode) {
      // Demo mode - just show the message
      return;
    }

    if (socket && socket.connected) {
      const messageData = {
        user: username,
        username: username,
        tempId: tempId,
        messageType: uploadData.messageType,
        mediaUrl: uploadData.mediaUrl,
        mediaType: uploadData.mediaType,
        fileName: uploadData.fileName,
        fileSize: uploadData.fileSize,
        mediaDuration: uploadData.mediaDuration,
        text: messageText,
        replyToId: replyToId,
        chatId: activeChatId || undefined
      };

      console.log('Sending media message via Socket.io:', messageData);
      socket.emit('message', messageData);
    } else {
      addMessage("Media not sent: Disconnected", "System", false, true);
    }
  }, [socket, addMessage, activeChatId]);

  const editMessage = useCallback((id: string, newText: string) => {
    if (!socket || !socket.connected) return;

    // Optimistic update
    setMessages(prev => prev.map(msg =>
      msg.id === id
        ? { ...msg, text: newText, updatedAt: Date.now() }
        : msg
    ));

    socket.emit('editMessage', { id, text: newText });
  }, [socket]);

  const deleteMessage = useCallback((id: string) => {
    if (!socket || !socket.connected) return;

    // Optimistic update
    setMessages(prev => prev.filter(msg => msg.id !== id));

    socket.emit('deleteMessage', { id });
  }, [socket]);

  const createChat = useCallback((name: string, description?: string) => {
    if (!socket || !socket.connected) return;
    socket.emit('createChat', { name, description });
  }, [socket]);

  const toggleReaction = useCallback((messageId: string, emoji: string) => {
    if (!socket || !socket.connected) return;
    const username = settingsRef.current.username;

    // Optimistic update
    setMessages(prev => prev.map(msg => {
      if (msg.id === messageId) {
        const reactions = { ...(msg.reactions || {}) };
        const currentReactors = reactions[emoji] || [];
        const newReactors = currentReactors.includes(username)
          ? currentReactors.filter(u => u !== username)
          : [...currentReactors, username];

        if (newReactors.length === 0) {
          delete reactions[emoji];
        } else {
          reactions[emoji] = newReactors;
        }
        return { ...msg, reactions };
      }
      return msg;
    }));

    socket.emit('toggleReaction', { messageId, emoji, username });
  }, [socket]);

  const forwardMessage = useCallback((message: Message, targetChatId: string) => {
    if (!socket || !socket.connected) return;
    const username = settingsRef.current.username;

    const forwardData = {
      user: username,
      username: username,
      text: message.text,
      messageType: message.messageType,
      mediaUrl: message.mediaUrl,
      mediaType: message.mediaType,
      fileName: message.fileName,
      fileSize: message.fileSize,
      mediaDuration: message.mediaDuration,
      chatId: targetChatId,
      isForwarded: true,
      forwardedFrom: message.sender
    };

    console.log('Forwarding message:', forwardData);
    socket.emit('message', forwardData);
  }, [socket]);

  return {
    messages,
    chats,
    activeChatId,
    setActiveChatId,
    status,
    sendMessage,
    sendMediaMessage,
    clearMessages,
    editMessage,
    deleteMessage,
    createChat,
    fetchChats,
    toggleReaction,
    forwardMessage
  };
};