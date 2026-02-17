import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Message, ConnectionStatus, UserSettings, Chat, UserInfo } from '../../types';
import { DbMessage } from './types';
import { useSocketEvents } from './useSocketEvents';
import { useChatActions } from './useChatActions';
import { useWebRTCCall } from './useWebRTCCall';

interface User {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
}

export const useChatConnection = (settings: UserSettings, token: string | null, user: User | null) => {
    const PAGE_SIZE = 50;
    const READ_STATE_STORAGE_KEY = 'blackout_read_state_v1';
    const [messages, setMessages] = useState<Message[]>([]);
    const [chats, setChats] = useState<Chat[]>([]);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
    const [socket, setSocket] = useState<Socket | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const [users, setUsers] = useState<Record<string, UserInfo>>({});
    const [typingUsers, setTypingUsers] = useState<Array<{ userId: string; displayName: string }>>([]);
    const [hasMoreMessages, setHasMoreMessages] = useState(true);
    const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
    const [lastReadByChat, setLastReadByChat] = useState<Record<string, number>>(() => {
        if (typeof window === 'undefined') return {};
        try {
            const saved = localStorage.getItem(READ_STATE_STORAGE_KEY);
            if (!saved) return {};
            const parsed = JSON.parse(saved);
            if (!parsed || typeof parsed !== 'object') return {};
            return parsed;
        } catch {
            return {};
        }
    });
    const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
    const [firstUnreadMessageIdByChat, setFirstUnreadMessageIdByChat] = useState<Record<string, string | null>>({});

    const settingsRef = useRef(settings);
    useEffect(() => {
        settingsRef.current = settings;
    }, [settings]);

    useEffect(() => {
        socketRef.current = socket;
    }, [socket]);

    const activeChatIdRef = useRef(activeChatId);
    useEffect(() => {
        activeChatIdRef.current = activeChatId;
    }, [activeChatId]);

    const userRef = useRef(user);
    useEffect(() => {
        userRef.current = user;
    }, [user]);

    const tokenRef = useRef(token);
    useEffect(() => {
        tokenRef.current = token;
    }, [token]);

    const lastReadByChatRef = useRef(lastReadByChat);
    useEffect(() => {
        lastReadByChatRef.current = lastReadByChat;
        if (typeof window !== 'undefined') {
            localStorage.setItem(READ_STATE_STORAGE_KEY, JSON.stringify(lastReadByChat));
        }
    }, [lastReadByChat]);

    const markChatAsRead = useCallback((chatId: string, readAt?: number) => {
        if (!chatId) return;
        const nextReadAt = typeof readAt === 'number' ? readAt : Date.now();

        setLastReadByChat(prev => {
            const current = prev[chatId] || 0;
            if (nextReadAt <= current) return prev;
            return { ...prev, [chatId]: nextReadAt };
        });

        setUnreadCounts(prev => {
            if (!prev[chatId]) return prev;
            return { ...prev, [chatId]: 0 };
        });
    }, []);

    const getFirstUnreadMessageId = useCallback((chatMessages: Message[], readAt: number): string | null => {
        const firstUnread = chatMessages.find(
            (message) => !message.isSystem && !message.isMe && message.timestamp > readAt
        );
        return firstUnread?.id || null;
    }, []);

    const addMessage = useCallback((text: string, sender: string, isMe: boolean = false, isSystem: boolean = false, replyToId?: string, displayName?: string) => {
        const id = Math.random().toString(36).substring(7);
        const newMessage: Message = {
            id,
            text,
            sender,
            displayName: displayName || sender, // Use provided displayName or fallback to sender
            timestamp: Date.now(),
            isMe,
            isSystem,
            replyToId
        };
        setMessages(prev => [...prev, newMessage]);
        return id;
    }, []);

    const mapDbMessage = useCallback((dbMsg: DbMessage): Message => ({
        id: dbMsg.id,
        text: dbMsg.content,
        sender: dbMsg.username,
        displayName: dbMsg.displayName || dbMsg.username,
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
        stickerId: dbMsg.stickerId,
        deliveredCount: dbMsg.deliveredCount || 0,
        seenCount: dbMsg.seenCount || 0,
        seenBy: dbMsg.seenBy || [],
        updatedAt: dbMsg.updatedAt ? new Date(dbMsg.updatedAt).getTime() : undefined
    }), [settings.username]);

    // Initialize socket events
    useSocketEvents({
        socket,
        status,
        settingsRef,
        activeChatIdRef,
        setMessages,
        setChats,
        setStatus,
        setTypingUsers,
        addMessage,
        onInactiveChatMessage: (chatId: string) => {
            setUnreadCounts(prev => ({
                ...prev,
                [chatId]: (prev[chatId] || 0) + 1
            }));
        }
    });

    // Action methods
    const actions = useChatActions({
        socket,
        activeChatId,
        settingsRef,
        userRef,
        tokenRef,
        setMessages,
        setChats,
        setActiveChatId,
        addMessage
    });

    // Fetch all available chats
    const fetchChats = useCallback(async () => {
        if (!token) return;
        
        try {
            const response = await fetch(`${settings.serverUrl}/api/chats`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
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
    }, [settings.serverUrl, token]);

    // Fetch all users for avatar caching
    const fetchUsers = useCallback(async () => {
        if (!token) return;
        
        try {
            const response = await fetch(`${settings.serverUrl}/api/auth/users`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (response.ok) {
                const data: { username: string; avatarUrl?: string; displayName: string }[] = await response.json();
                const usersMap: Record<string, UserInfo> = {};
                data.forEach(u => {
                    usersMap[u.username.toLowerCase()] = {
                        avatarUrl: u.avatarUrl,
                        displayName: u.displayName
                    };
                });
                setUsers(usersMap);
            }
        } catch (error) {
            console.error('Error fetching users:', error);
        }
    }, [settings.serverUrl, token]);

    useEffect(() => {
        setTypingUsers([]);
    }, [activeChatId]);

    useEffect(() => {
        if (status === ConnectionStatus.CONNECTED) {
            fetchChats();
            fetchUsers();
        }
    }, [status, fetchChats, fetchUsers]);

    // Initialize connection
    useEffect(() => {
        if (settings.isDemoMode) {
            setStatus(ConnectionStatus.CONNECTED);
            addMessage("Demo Mode Active. Messages are simulated.", "System", false, true);
            return;
        }

        if (!token) {
            if (socketRef.current) {
                socketRef.current.removeAllListeners();
                socketRef.current.disconnect();
                setSocket(null);
            }
            setStatus(ConnectionStatus.ERROR);
            addMessage("Authentication required. Please login.", "System", false, true);
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
            forceNew: true,
            auth: {
                token: token
            }
        });

        setSocket(newSocket);

        return () => {
            newSocket.removeAllListeners();
            newSocket.disconnect();
        };
    }, [settings.serverUrl, settings.isDemoMode, settings.username, token, addMessage]);

    // Handle active chat changes (Fetch history & Join room)
    useEffect(() => {
        if (status !== ConnectionStatus.CONNECTED || settings.isDemoMode) return;

        const loadHistory = async () => {
            if (!activeChatId) return;

            setMessages([]);
            setHasMoreMessages(true);
            setIsLoadingOlderMessages(false);
            setUnreadCounts(prev => ({ ...prev, [activeChatId]: 0 }));

            try {
                console.log(`Loading history for chat: ${activeChatId}`);
                const response = await fetch(`${settings.serverUrl}/api/messages?chatId=${activeChatId}&limit=${PAGE_SIZE}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                if (response.ok) {
                    const dbMessages: DbMessage[] = await response.json();
                    const loadedMessages: Message[] = dbMessages.reverse().map(mapDbMessage);
                    const previousReadAt = lastReadByChatRef.current[activeChatId] || 0;
                    const firstUnreadMessageId = getFirstUnreadMessageId(loadedMessages, previousReadAt);
                    const lastIncomingMessage = [...loadedMessages].reverse().find(
                        (message) => !message.isSystem && !message.isMe
                    );

                    setMessages(loadedMessages);
                    setFirstUnreadMessageIdByChat(prev => ({
                        ...prev,
                        [activeChatId]: firstUnreadMessageId
                    }));
                    setHasMoreMessages(dbMessages.length === PAGE_SIZE);
                    markChatAsRead(activeChatId, lastIncomingMessage?.timestamp || Date.now());
                    if (socket && socket.connected) {
                        socket.emit('markChatSeen', activeChatId);
                    }
                }
            } catch (error) {
                console.error('Error loading messages:', error);
            }
        };

        loadHistory();

        if (socket && socket.connected && activeChatId) {
            socket.emit('joinChat', activeChatId);
        }
    }, [
        activeChatId,
        status,
        socket,
        settings.serverUrl,
        settings.isDemoMode,
        token,
        mapDbMessage,
        getFirstUnreadMessageId,
        markChatAsRead
    ]);

    useEffect(() => {
        if (!activeChatId || messages.length === 0) return;
        const lastIncomingMessage = [...messages].reverse().find(
            (message) => !message.isSystem && !message.isMe
        );
        if (!lastIncomingMessage) return;
        markChatAsRead(activeChatId, lastIncomingMessage.timestamp);
    }, [activeChatId, messages, markChatAsRead]);

    const loadOlderMessages = useCallback(async (): Promise<number> => {
        if (
            settings.isDemoMode ||
            status !== ConnectionStatus.CONNECTED ||
            !activeChatId ||
            !token ||
            isLoadingOlderMessages ||
            !hasMoreMessages ||
            messages.length === 0
        ) {
            return 0;
        }

        const oldestTimestamp = messages[0]?.timestamp;
        if (!oldestTimestamp) return 0;

        setIsLoadingOlderMessages(true);
        try {
            const response = await fetch(
                `${settings.serverUrl}/api/messages?chatId=${activeChatId}&before=${oldestTimestamp}&limit=${PAGE_SIZE}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }
            );

            if (!response.ok) return 0;

            const dbMessages: DbMessage[] = await response.json();
            const olderMessages: Message[] = dbMessages.reverse().map(mapDbMessage);
            const existingIds: Set<string> = new Set(messages.map((m: Message) => m.id));
            const uniqueOlderMessages: Message[] = olderMessages.filter((m: Message) => !existingIds.has(m.id));

            if (uniqueOlderMessages.length > 0) {
                setMessages(prev => [...uniqueOlderMessages, ...prev]);
            }

            setHasMoreMessages(dbMessages.length === PAGE_SIZE);
            return uniqueOlderMessages.length;
        } catch (error) {
            console.error('Error loading older messages:', error);
            return 0;
        } finally {
            setIsLoadingOlderMessages(false);
        }
    }, [
        settings.isDemoMode,
        status,
        activeChatId,
        token,
        isLoadingOlderMessages,
        hasMoreMessages,
        messages,
        settings.serverUrl,
        mapDbMessage
    ]);

    const call = useWebRTCCall({
        socket,
        activeChatId,
        user
    });

    return {
        messages,
        chats,
        activeChatId,
        setActiveChatId,
        status,
        fetchChats,
        users,
        typingUsers,
        unreadCounts,
        firstUnreadMessageId: activeChatId ? (firstUnreadMessageIdByChat[activeChatId] || null) : null,
        hasMoreMessages,
        isLoadingOlderMessages,
        loadOlderMessages,
        ...call,
        ...actions
    };
};
