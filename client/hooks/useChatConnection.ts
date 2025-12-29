import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Message, ConnectionStatus, UserSettings } from '../types';

// Database message format from API
interface DbMessage {
  id: string;
  username: string;
  content: string;
  createdAt: string | Date;
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
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [socket, setSocket] = useState<Socket | null>(null);
  
  // Use a ref for settings to access latest values in effects without re-triggering connection
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const addMessage = useCallback((text: string, sender: string, isMe: boolean = false, isSystem: boolean = false) => {
    const newMessage: Message = {
      id: Math.random().toString(36).substring(7),
      text,
      sender,
      timestamp: Date.now(),
      isMe,
      isSystem
    };
    setMessages(prev => [...prev, newMessage]);
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

    newSocket.on('connect', async () => {
      console.log('Socket.io connected!', { socketId: newSocket.id, serverUrl: settings.serverUrl });
      setStatus(ConnectionStatus.CONNECTED);
      
      // Load previous messages from database first
      try {
        const response = await fetch(`${settings.serverUrl}/api/messages`);
        if (response.ok) {
          const dbMessages: DbMessage[] = await response.json();
          // Convert database messages to frontend format
          const loadedMessages: Message[] = dbMessages
            .reverse() // Reverse to show oldest first (API returns newest first)
            .map((dbMsg) => ({
              id: dbMsg.id,
              text: dbMsg.content,
              sender: dbMsg.username,
              timestamp: new Date(dbMsg.createdAt).getTime(),
              isMe: dbMsg.username === settings.username,
              isSystem: false,
            }));
          
          // Set loaded messages (this will replace any existing messages)
          setMessages(loadedMessages);
        }
      } catch (error) {
        console.error('Error loading messages:', error);
        // Continue without loaded messages
      }
      
      // Show connection message after loading history
      addMessage(`Connected to ${settings.serverUrl}`, "System", false, true);
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

    newSocket.on('message', (data: { user: string, text: string }) => {
      const isFromMe = data.user === settingsRef.current.username;
      
      // Filter out our own messages - we already show them optimistically
      if (isFromMe) {
        return;
      }
      
      const currentTime = Date.now();
      
      setMessages(prev => {
        // Check for duplicates from other users within a reasonable time window
        const recentTime = currentTime - 10000; // 10 second window
        const duplicate = prev.find(
          msg => msg.text === data.text && 
                 msg.sender === data.user && 
                 msg.timestamp > recentTime &&
                 !msg.isSystem
        );
        
        if (duplicate) {
          return prev;
        }
        
        // Add new message from other users
        const newMessage: Message = {
          id: Math.random().toString(36).substring(7),
          text: data.text,
          sender: data.user,
          timestamp: currentTime,
          isMe: false, // Always false since we filtered out our own messages
          isSystem: false,
        };
        return [...prev, newMessage];
      });
    });

    setSocket(newSocket);

    return () => {
      newSocket.removeAllListeners();
      newSocket.disconnect();
    };
  }, [settings.serverUrl, settings.isDemoMode, settings.username, addMessage]);

  const sendMessage = useCallback((text: string) => {
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
    addMessage(trimmedText, username, true);

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
        text: String(trimmedText)
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
  }, [socket, addMessage, status]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    status,
    sendMessage,
    clearMessages
  };
};