import { useEffect, Dispatch, SetStateAction, MutableRefObject } from 'react';
import { Socket } from 'socket.io-client';
import { Message, ConnectionStatus, UserSettings, Chat } from '../../types';

interface UseSocketEventsProps {
    socket: Socket | null;
    status: ConnectionStatus;
    settingsRef: MutableRefObject<UserSettings>;
    activeChatIdRef: MutableRefObject<string | null>;
    setMessages: Dispatch<SetStateAction<Message[]>>;
    setChats: Dispatch<SetStateAction<Chat[]>>;
    setStatus: Dispatch<SetStateAction<ConnectionStatus>>;
    addMessage: (text: string, sender: string, isMe?: boolean, isSystem?: boolean, replyToId?: string, displayName?: string) => string;
}

export const useSocketEvents = ({
    socket,
    status,
    settingsRef,
    activeChatIdRef,
    setMessages,
    setChats,
    setStatus,
    addMessage
}: UseSocketEventsProps) => {
    useEffect(() => {
        if (!socket) return;

        const handleConnect = () => {
            console.log('Socket.io connected!', { socketId: socket.id, serverUrl: settingsRef.current.serverUrl });
            setStatus(ConnectionStatus.CONNECTED);

            // Show connection message
            addMessage(`Connected to ${settingsRef.current.serverUrl}`, "System", false, true);

            // Join current active chat if available
            if (activeChatIdRef.current) {
                socket.emit('joinChat', activeChatIdRef.current);
            }

            // Join a default room or announce presence
            socket.emit('join', settingsRef.current.username);
        };

        const handleConnectError = (err: any) => {
            console.error('Socket connection error:', err.message);
            console.error('Connection details:', { serverUrl: settingsRef.current.serverUrl, error: err });
            setStatus(ConnectionStatus.ERROR);
        };

        const handleDisconnect = (reason: string) => {
            setStatus(ConnectionStatus.DISCONNECTED);
            addMessage(`Disconnected: ${reason}`, "System", false, true);
        };

        const handleMessage = (data: any) => {
            const senderName = (data.user || data.username || '').trim().toLowerCase();
            const currentUserName = (settingsRef.current.username || '').trim().toLowerCase();
            const isFromMe = senderName === currentUserName;
            const currentTime = Date.now();

            // Client-side isolation check: ignore synchronization for other chats
            if (data.chatId && activeChatIdRef.current && data.chatId !== activeChatIdRef.current) {
                console.log('Ignored message for different chat:', data.chatId);
                return;
            }

            setMessages(prev => {
                // 1. If we already have this specific database ID, ignore it
                if (data.id && prev.some(m => m.id === data.id)) {
                    return prev;
                }

                let matchedIndex = -1;

                // 2. Try to find a local optimistic message to "confirm" with server data
                if (data.tempId) {
                    matchedIndex = prev.findIndex(msg => msg.id === data.tempId);
                } else if (isFromMe) {
                    // Fallback matching for own messages without tempId
                    const recentTime = currentTime - 10000;
                    matchedIndex = prev.findIndex(msg =>
                        msg.text === data.text &&
                        msg.sender === (data.user || data.username) &&
                        msg.timestamp > recentTime &&
                        !msg.id.includes('-') // Real UUIDs are usually hyphenated, temp ones here are 7-char random strings
                    );
                }

                if (matchedIndex !== -1) {
                    // Update the existing optimistic message
                    const updatedMessages = [...prev];
                    updatedMessages[matchedIndex] = {
                        ...updatedMessages[matchedIndex],
                        id: data.id || updatedMessages[matchedIndex].id,
                        timestamp: data.createdAt ? new Date(data.createdAt).getTime() : updatedMessages[matchedIndex].timestamp,
                        replyToId: data.replyToId,
                        displayName: data.displayName || updatedMessages[matchedIndex].displayName
                    };
                    return updatedMessages;
                }

                // 3. Prevent duplicates if data.id is missing (system messages or old server logic)
                const recentTime = currentTime - 10000;
                const duplicate = prev.find(
                    msg => msg.text === data.text &&
                        msg.sender === (data.user || data.username) &&
                        msg.timestamp > recentTime &&
                        !msg.isSystem
                );

                if (duplicate) return prev;

                // 4. It's a truly new message (from others or system)
                const newMessage: Message = {
                    id: data.id || Math.random().toString(36).substring(7),
                    text: data.text,
                    sender: data.user || data.username,
                    displayName: data.displayName || data.user || data.username,
                    timestamp: data.createdAt ? new Date(data.createdAt).getTime() : currentTime,
                    isMe: isFromMe,
                    isSystem: false,
                    messageType: data.messageType as any,
                    mediaUrl: data.mediaUrl,
                    mediaType: data.mediaType,
                    mediaDuration: data.mediaDuration,
                    fileName: data.fileName,
                    fileSize: data.fileSize,
                    replyToId: data.replyToId,
                    chatId: data.chatId,
                    isForwarded: data.isForwarded,
                    forwardedFrom: data.forwardedFrom,
                    stickerId: data.stickerId
                };

                // Update chat list order if necessary
                if (data.chatId) {
                    setChats(prevChats => {
                        const chatIndex = prevChats.findIndex(c => c.id === data.chatId);
                        if (chatIndex === -1) return prevChats;

                        const updatedChats = [...prevChats];
                        const [movedChat] = updatedChats.splice(chatIndex, 1);
                        movedChat.lastMessageAt = newMessage.timestamp;
                        return [movedChat, ...updatedChats];
                    });
                }

                return [...prev, newMessage];
            });
        };

        const handleMessageUpdated = (data: { id: string, text: string, updatedAt: string }) => {
            setMessages(prev => prev.map(msg =>
                msg.id === data.id
                    ? { ...msg, text: data.text, updatedAt: new Date(data.updatedAt).getTime() }
                    : msg
            ));
        };

        const handleMessageDeleted = (data: { id: string }) => {
            setMessages(prev => prev.filter(msg => msg.id !== data.id));
        };

        const handleReactionUpdated = (data: { messageId: string, reactions: Record<string, string[]> }) => {
            setMessages(prev => prev.map(msg =>
                msg.id === data.messageId
                    ? { ...msg, reactions: data.reactions }
                    : msg
            ));
        };

        const handleChatCreated = (newChat: Chat) => {
            setChats(prev => [newChat, ...prev]);
        };

        const handleChatUpdated = (updatedChat: Chat) => {
            setChats(prev => prev.map(chat => 
                chat.id === updatedChat.id ? updatedChat : chat
            ));
        };

        const handleChatPinnedUpdated = (data: {
            chatId: string;
            pinnedMessageId: string | null;
            pinnedByUserId: string | null;
            pinnedAt: string | null;
            pinnedMessage: Chat['pinnedMessage'] | null;
        }) => {
            setChats(prev => prev.map(chat =>
                chat.id === data.chatId
                    ? {
                        ...chat,
                        pinnedMessageId: data.pinnedMessageId,
                        pinnedByUserId: data.pinnedByUserId,
                        pinnedAt: data.pinnedAt,
                        pinnedMessage: data.pinnedMessage
                    }
                    : chat
            ));
        };

        socket.on('connect', handleConnect);
        socket.on('connect_error', handleConnectError);
        socket.on('disconnect', handleDisconnect);
        socket.on('message', handleMessage);
        socket.on('messageUpdated', handleMessageUpdated);
        socket.on('messageDeleted', handleMessageDeleted);
        socket.on('reactionUpdated', handleReactionUpdated);
        socket.on('chatCreated', handleChatCreated);
        socket.on('chatUpdated', handleChatUpdated);
        socket.on('chatPinnedUpdated', handleChatPinnedUpdated);

        return () => {
            socket.off('connect', handleConnect);
            socket.off('connect_error', handleConnectError);
            socket.off('disconnect', handleDisconnect);
            socket.off('message', handleMessage);
            socket.off('messageUpdated', handleMessageUpdated);
            socket.off('messageDeleted', handleMessageDeleted);
            socket.off('reactionUpdated', handleReactionUpdated);
            socket.off('chatCreated', handleChatCreated);
            socket.off('chatUpdated', handleChatUpdated);
            socket.off('chatPinnedUpdated', handleChatPinnedUpdated);
        };
    }, [socket, settingsRef, activeChatIdRef, setMessages, setChats, setStatus, addMessage]);
};
