import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Message, ConnectionStatus, UserSettings } from '../types';

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

    newSocket.on('connect', () => {
      setStatus(ConnectionStatus.CONNECTED);
      addMessage(`Connected to ${settings.serverUrl}`, "System", false, true);
      // Join a default room or announce presence
      newSocket.emit('join', settings.username);
    });

    newSocket.on('connect_error', (err) => {
      console.warn('Socket connection error:', err.message);
      // Update status to ERROR to inform UI, but socket will keep retrying due to reconnection: true
      setStatus(ConnectionStatus.ERROR);
    });

    newSocket.on('disconnect', (reason) => {
      setStatus(ConnectionStatus.DISCONNECTED);
      addMessage(`Disconnected: ${reason}`, "System", false, true);
    });

    newSocket.on('message', (data: { user: string, text: string }) => {
      addMessage(data.text, data.user, false);
    });

    setSocket(newSocket);

    return () => {
      newSocket.removeAllListeners();
      newSocket.disconnect();
    };
  }, [settings.serverUrl, settings.isDemoMode, settings.username, addMessage]);

  const sendMessage = useCallback((text: string) => {
    if (!text.trim()) return;

    // Add local message immediately for optimistic UI
    addMessage(text, settingsRef.current.username, true);

    if (settingsRef.current.isDemoMode) {
      // Simulate reply in demo mode
      setTimeout(() => {
        const randomResponse = DEMO_RESPONSES[Math.floor(Math.random() * DEMO_RESPONSES.length)];
        addMessage(randomResponse, "Operator", false);
      }, 1000 + Math.random() * 2000);
    } else if (socket && socket.connected) {
      // Send to server
      socket.emit('message', { user: settingsRef.current.username, text });
    } else {
      // Fallback if disconnected
      addMessage("Message not sent: Disconnected", "System", false, true);
    }
  }, [socket, addMessage]);

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