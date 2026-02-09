import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Message, ConnectionStatus, UserSettings, Chat } from '../../types';
import { DbMessage } from './types';
import { useSocketEvents } from './useSocketEvents';
import { useChatActions } from './useChatActions';

export const useChatConnection = (settings: UserSettings) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [chats, setChats] = useState<Chat[]>([]);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
    const [socket, setSocket] = useState<Socket | null>(null);

    const settingsRef = useRef(settings);
    useEffect(() => {
        settingsRef.current = settings;
    }, [settings]);

    const activeChatIdRef = useRef(activeChatId);
    useEffect(() => {
        activeChatIdRef.current = activeChatId;
    }, [activeChatId]);

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

    // Initialize socket events
    useSocketEvents({
        socket,
        status,
        settingsRef,
        activeChatIdRef,
        setMessages,
        setChats,
        setStatus,
        addMessage
    });

    // Action methods
    const actions = useChatActions({
        socket,
        activeChatId,
        settingsRef,
        setMessages,
        setChats,
        addMessage
    });

    // Fetch all available chats
    const fetchChats = useCallback(async () => {
        try {
            const response = await fetch(`${settings.serverUrl}/api/chats`);
            if (response.ok) {
                const data: Chat[] = await response.json();
                setChats(data);

                // Auto-select first chat (e.g. Global) if none selected
                if (data.length > 0 && !activeChatIdRef.current) {
                    setActiveChatId(data[0].id);
                }
            }
        } catch (error) {
            console.error('Error fetching chats:', error);
        }
    }, [settings.serverUrl]);

    useEffect(() => {
        if (status === ConnectionStatus.CONNECTED) {
            fetchChats();
        }
    }, [status, fetchChats]);

    // Initialize connection
    useEffect(() => {
        if (settings.isDemoMode) {
            setStatus(ConnectionStatus.CONNECTED);
            addMessage("Demo Mode Active. Messages are simulated.", "System", false, true);
            return;
        }

        setStatus(ConnectionStatus.CONNECTING);

        const newSocket = io(settings.serverUrl, {
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000,
            transports: ['polling', 'websocket'],
            forceNew: true
        });

        setSocket(newSocket);

        return () => {
            newSocket.removeAllListeners();
            newSocket.disconnect();
        };
    }, [settings.serverUrl, settings.isDemoMode, settings.username, addMessage]);

    // Handle active chat changes (Fetch history & Join room)
    useEffect(() => {
        if (status !== ConnectionStatus.CONNECTED || settings.isDemoMode) return;

        const loadHistory = async () => {
            if (!activeChatId) return;

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
                            forwardedFrom: dbMsg.forwardedFrom,
                            stickerId: dbMsg.stickerId
                        }));
                    setMessages(loadedMessages);
                }
            } catch (error) {
                console.error('Error loading messages:', error);
            }
        };

        loadHistory();

        if (socket && socket.connected && activeChatId) {
            socket.emit('joinChat', activeChatId);
        }
    }, [activeChatId, status, socket, settings.serverUrl, settings.isDemoMode, settings.username]);

    return {
        messages,
        chats,
        activeChatId,
        setActiveChatId,
        status,
        fetchChats,
        ...actions
    };
};
