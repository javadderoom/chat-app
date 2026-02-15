import { useCallback, Dispatch, SetStateAction, MutableRefObject } from 'react';
import { Socket } from 'socket.io-client';
import { Message, UserSettings, Chat } from '../../types';
import { DEMO_RESPONSES } from './constants';

interface UseChatActionsProps {
    socket: Socket | null;
    activeChatId: string | null;
    settingsRef: MutableRefObject<UserSettings>;
    userRef: MutableRefObject<{ id: string; username: string; displayName: string; avatarUrl?: string } | null>;
    tokenRef: MutableRefObject<string | null>;
    setMessages: Dispatch<SetStateAction<Message[]>>;
    setChats: Dispatch<SetStateAction<Chat[]>>;
    setActiveChatId: Dispatch<SetStateAction<string | null>>;
    addMessage: (text: string, sender: string, isMe?: boolean, isSystem?: boolean, replyToId?: string, displayName?: string) => string;
}

export const useChatActions = ({
    socket,
    activeChatId,
    settingsRef,
    userRef,
    tokenRef,
    setMessages,
    setChats,
    setActiveChatId,
    addMessage
}: UseChatActionsProps) => {

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
        const userDisplayName = userRef.current?.displayName || username;
        const tempId = addMessage(trimmedText, username, true, false, replyToId, userDisplayName);

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
            socket.emit('message', messageData);

            // Optimistically move chat to top
            if (activeChatId) {
                setChats(prevChats => {
                    const chatIndex = prevChats.findIndex(c => c.id === activeChatId);
                    if (chatIndex === -1) return prevChats;

                    const updatedChats = [...prevChats];
                    const [movedChat] = updatedChats.splice(chatIndex, 1);
                    movedChat.lastMessageAt = Date.now();
                    return [movedChat, ...updatedChats];
                });
            }
        } else {
            // Fallback if disconnected
            console.warn('Cannot send message - socket not connected', {
                socketExists: !!socket,
                socketConnected: socket?.connected,
            });
            addMessage("Message not sent: Disconnected", "System", false, true);
        }
    }, [socket, addMessage, activeChatId, settingsRef, setChats]);

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

            // Optimistically move chat to top
            if (activeChatId) {
                setChats(prevChats => {
                    const chatIndex = prevChats.findIndex(c => c.id === activeChatId);
                    if (chatIndex === -1) return prevChats;

                    const updatedChats = [...prevChats];
                    const [movedChat] = updatedChats.splice(chatIndex, 1);
                    movedChat.lastMessageAt = Date.now();
                    return [movedChat, ...updatedChats];
                });
            }
        } else {
            addMessage("Media not sent: Disconnected", "System", false, true);
        }
    }, [socket, addMessage, activeChatId, settingsRef, setMessages, setChats]);

    const editMessage = useCallback((id: string, newText: string) => {
        if (!socket || !socket.connected) return;

        // Optimistic update
        setMessages(prev => prev.map(msg =>
            msg.id === id
                ? { ...msg, text: newText, updatedAt: Date.now() }
                : msg
        ));

        socket.emit('editMessage', { id, text: newText });
    }, [socket, setMessages]);

    const deleteMessage = useCallback((id: string) => {
        if (!socket || !socket.connected) return;

        // Optimistic update
        setMessages(prev => prev.filter(msg => msg.id !== id));

        socket.emit('deleteMessage', { id });
    }, [socket, setMessages]);

    const createChat = useCallback((name: string, description?: string, isPrivate?: boolean) => {
        if (!socket || !socket.connected) return;
        socket.emit('createChat', { name, description, isPrivate });
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
    }, [socket, settingsRef, setMessages]);

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
            forwardedFrom: message.sender,
            stickerId: message.stickerId
        };

        console.log('Forwarding message:', forwardData);
        socket.emit('message', forwardData);
    }, [socket, settingsRef]);

    const clearMessages = useCallback(() => {
        setMessages([]);
    }, [setMessages]);

    const updateChat = useCallback((chatId: string, data: { name?: string; description?: string; imageUrl?: string }) => {
        if (!socket || !socket.connected) return;

        socket.emit('updateChat', { id: chatId, ...data });

        setChats(prevChats => prevChats.map(chat => 
            chat.id === chatId 
                ? { ...chat, ...data }
                : chat
        ));
    }, [socket, setChats]);

    const deleteChat = useCallback(async (chatId: string) => {
        try {
            const response = await fetch(`${settingsRef.current.serverUrl}/api/chats/${chatId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${tokenRef.current}`
                }
            });
            if (response.ok) {
                setChats(prevChats => prevChats.filter(chat => chat.id !== chatId));
                setActiveChatId(null);
            }
        } catch (error) {
            console.error('Error deleting chat:', error);
        }
    }, [setChats, setActiveChatId, settingsRef, tokenRef]);

    const pinMessage = useCallback((messageId: string) => {
        if (!socket || !socket.connected || !activeChatId || !messageId) return;

        setChats(prevChats => prevChats.map(chat =>
            chat.id === activeChatId
                ? {
                    ...chat,
                    pinnedMessageId: messageId,
                    pinnedByUserId: userRef.current?.id || null,
                    pinnedAt: Date.now()
                }
                : chat
        ));

        socket.emit('pinMessage', { chatId: activeChatId, messageId });
    }, [socket, activeChatId, setChats, userRef]);

    const unpinMessage = useCallback((chatId?: string) => {
        const targetChatId = chatId || activeChatId;
        if (!socket || !socket.connected || !targetChatId) return;

        setChats(prevChats => prevChats.map(chat =>
            chat.id === targetChatId
                ? {
                    ...chat,
                    pinnedMessageId: null,
                    pinnedByUserId: null,
                    pinnedAt: null,
                    pinnedMessage: null
                }
                : chat
        ));

        socket.emit('unpinMessage', { chatId: targetChatId });
    }, [socket, activeChatId, setChats]);

    const sendSticker = useCallback((stickerId: string, replyToId?: string) => {
        if (!stickerId) return;
        const username = settingsRef.current.username?.trim() || 'Anonymous';

        // Add local message immediately for optimistic UI
        const tempId = Math.random().toString(36).substring(7);
        const localMessage: Message = {
            id: tempId,
            text: `[STICKER]`,
            sender: username,
            timestamp: Date.now(),
            isMe: true,
            isSystem: false,
            messageType: 'sticker',
            stickerId: stickerId,
            replyToId: replyToId
        };
        setMessages(prev => [...prev, localMessage]);

        if (settingsRef.current.isDemoMode) return;

        if (socket && socket.connected) {
            const messageData = {
                user: username,
                username: username,
                tempId: tempId,
                messageType: 'sticker',
                stickerId: stickerId,
                text: `[STICKER]`,
                replyToId: replyToId,
                chatId: activeChatId || undefined
            };

            socket.emit('message', messageData);

            // Optimistically move chat to top
            if (activeChatId) {
                setChats(prevChats => {
                    const chatIndex = prevChats.findIndex(c => c.id === activeChatId);
                    if (chatIndex === -1) return prevChats;

                    const updatedChats = [...prevChats];
                    const [movedChat] = updatedChats.splice(chatIndex, 1);
                    movedChat.lastMessageAt = Date.now();
                    return [movedChat, ...updatedChats];
                });
            }
        } else {
            addMessage("Sticker not sent: Disconnected", "System", false, true);
        }
    }, [socket, addMessage, activeChatId, settingsRef, setMessages, setChats]);

    return {
        sendMessage,
        sendMediaMessage,
        editMessage,
        deleteMessage,
        createChat,
        toggleReaction,
        forwardMessage,
        sendSticker,
        clearMessages,
        updateChat,
        deleteChat,
        pinMessage,
        unpinMessage
    };
};
