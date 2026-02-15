import React, { useState, useEffect, useRef } from 'react';
import { Send, WifiOff, Smile, Mic, Trash2, X, Square, Check, Menu, Image as ImageIcon, Video as VideoIcon, Music as MusicIcon, Settings, MessageSquare, Users, Pin } from 'lucide-react';
import { FileUploadButton, UploadResult } from './FileUploadButton';
import { StickerPicker } from './StickerPicker';
import { MessageBubble } from './MessageBubble';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { UserSettings, ConnectionStatus, Message, UserInfo, PinnedMessageSummary } from '../types';
import './ChatView.css';

import { ConfirmModal } from './ConfirmModal';
import { ForwardModal } from './ForwardModal';
import { ChatSettingsModal } from './ChatSettingsModal';
import { ChatMembersPanel } from './ChatMembersPanel';
import { ProfileModal } from './ProfileModal';

interface Chat {
    id: string;
    name: string;
    description?: string;
    imageUrl?: string;
    pinnedMessageId?: string | null;
    pinnedByUserId?: string | null;
    pinnedAt?: string | number | null;
    pinnedMessage?: PinnedMessageSummary | null;
}

interface User {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
}

interface ChatViewProps {
    activeChat: Chat | undefined;
    messages: Message[];
    status: ConnectionStatus;
    settings: UserSettings;
    sendMessage: (text: string, replyToId?: string) => void;
    sendMediaMessage: (media: any, replyToId?: string) => void;
    editMessage: (id: string, text: string) => void;
    deleteMessage: (id: string) => void;
    setShowSidebar: (show: boolean) => void;
    showSidebar: boolean;
    setShowServerHelp: (show: boolean) => void;
    toggleReaction: (messageId: string, emoji: string) => void;
    forwardMessage: (message: Message, targetChatId: string) => void;
    sendSticker: (stickerId: string, replyToId?: string) => void;
    updateChat: (chatId: string, data: { name?: string; description?: string; imageUrl?: string }) => void;
    deleteChat: (chatId: string) => void;
    pinMessage: (messageId: string) => void;
    unpinMessage: (chatId?: string) => void;
    setActiveChatId: (chatId: string) => void;
    fetchChats: () => Promise<void>;
    chats: Chat[];
    user?: User;
    token: string | null;
    users: Record<string, UserInfo>;
}

export const ChatView: React.FC<ChatViewProps> = ({
    activeChat,
    messages,
    status,
    settings,
    sendMessage,
    sendMediaMessage,
    editMessage,
    deleteMessage,
    setShowSidebar,
    showSidebar,
    setShowServerHelp,
    toggleReaction,
    forwardMessage,
    sendSticker,
    updateChat,
    deleteChat,
    pinMessage,
    unpinMessage,
    setActiveChatId,
    fetchChats,
    chats,
    user,
    token,
    users
}) => {
    const userAvatars: Record<string, string> = Object.fromEntries(
        Object.entries(users).map(([username, data]: [string, UserInfo]) => [username, data.avatarUrl || ''])
    );
    
    const [input, setInput] = useState('');
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
    const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null);
    const [pendingUpload, setPendingUpload] = useState<UploadResult | null>(null);
    const [menuPosition, setMenuPosition] = useState<{ top: number, right: number }>({ top: 0, right: 0 });
    const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
    const [messageToForward, setMessageToForward] = useState<Message | null>(null);
    const [isForwardModalOpen, setIsForwardModalOpen] = useState(false);
    const [isStickerPickerOpen, setIsStickerPickerOpen] = useState(false);
    const [isChatSettingsOpen, setIsChatSettingsOpen] = useState(false);
    const [showMembersPanel, setShowMembersPanel] = useState(false);
    const [profileUser, setProfileUser] = useState<{ username: string; displayName: string; avatarUrl?: string } | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const prevMessagesLengthRef = useRef(messages.length);

    const truncateText = (text: string, length: number = 20) => {
        if (!text) return '';
        return text.length > length ? text.substring(0, length) + '...' : text;
    };

    const getPinnedPreviewText = (message?: Message | PinnedMessageSummary | null) => {
        if (!message) return 'Pinned message';
        if (message.messageType === 'sticker') return '[STICKER]';
        if (message.messageType === 'image') return '[IMAGE]';
        if (message.messageType === 'video') return '[VIDEO]';
        if (message.messageType === 'audio') return '[AUDIO]';
        return message.text || 'Pinned message';
    };

    const activePinnedMessage = activeChat?.pinnedMessageId
        ? (messages.find(m => m.id === activeChat.pinnedMessageId) || activeChat.pinnedMessage || null)
        : null;

    useEffect(() => {
        // Only scroll if a new message was added (length increased)
        if (messages.length > prevMessagesLengthRef.current) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
        prevMessagesLengthRef.current = messages.length;
    }, [messages]);

    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
            inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 150)}px`;
        }
    }, [input]);

    const handleSend = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim() && !pendingUpload && !settings.isDemoMode) return;

        if (editingMessageId) {
            editMessage(editingMessageId, input);
            setEditingMessageId(null);
            setInput('');
        } else if (pendingUpload) {
            sendMediaMessage(pendingUpload, replyingToMessage?.id, input.trim() || undefined);
            setPendingUpload(null);
            setReplyingToMessage(null);
            setInput('');
        } else {
            sendMessage(input, replyingToMessage?.id);
            setReplyingToMessage(null);
            setInput('');
        }
    };

    const handleUploadComplete = (result: UploadResult) => {
        setPendingUpload(result);
        setUploadError(null);
        // Focus the input so user can type a caption
        inputRef.current?.focus();
    };

    const cancelPendingUpload = () => {
        setPendingUpload(null);
    };

    const handleVoiceUpload = async (file: File) => {
        try {
            const formData = new FormData();
            formData.append('file', file);
            const response = await fetch(`${settings.serverUrl}/api/upload/voice`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData,
            });

            if (!response.ok) throw new Error(`Upload failed: ${response.statusText}`);

            const data: UploadResult = await response.json();
            handleUploadComplete(data);
        } catch (error) {
            console.error('Voice upload failed:', error);
            setUploadError('Failed to send voice message');
        }
    };

    const { isRecording, recordingDuration, startRecording, stopRecording, cancelRecording } = useVoiceRecorder({
        onRecordingComplete: handleVoiceUpload,
        onError: (err) => setUploadError(err),
    });

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const startEditing = (msg: any) => {
        setEditingMessageId(msg.id);
        setInput(msg.text);
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    const cancelEdit = () => {
        setEditingMessageId(null);
        setInput('');
    };

    const startReply = (msg: any) => {
        setReplyingToMessage(msg);
        setEditingMessageId(null);
        setTimeout(() => inputRef.current?.focus(), 0);
        setActiveMenuId(null);
    };

    const cancelReply = () => setReplyingToMessage(null);

    const scrollToMessage = (id: string) => {
        const element = document.getElementById(`msg-${id}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('highlight_message');
            setTimeout(() => element.classList.remove('highlight_message'), 2000);
        }
    };

    const handleDelete = (id: string) => {
        setMessageToDelete(id);
        setActiveMenuId(null);
    };

    const confirmDelete = () => {
        if (messageToDelete) {
            deleteMessage(messageToDelete);
            setMessageToDelete(null);
        }
    };

    const handleForward = (msg: Message) => {
        setMessageToForward(msg);
        setIsForwardModalOpen(true);
        setActiveMenuId(null);
    };

    const handleDirectMessage = async (username: string) => {
        setActiveMenuId(null);
        console.log('handleDirectMessage called with username:', username);
        try {
            const response = await fetch(`${settings.serverUrl}/api/chats/dm`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username })
            });
            console.log('DM response status:', response.status);
            if (response.ok) {
                const dmChat = await response.json();
                console.log('DM chat received:', dmChat);
                await fetchChats();
                setActiveChatId(dmChat.id);
                console.log('setActiveChatId called with:', dmChat.id);
            }
        } catch (error) {
            console.error('Error creating DM:', error);
        }
    };

    const confirmForward = (targetChatId: string) => {
        if (messageToForward) {
            forwardMessage(messageToForward, targetChatId);
            setIsForwardModalOpen(false);
            setMessageToForward(null);
        }
    };

    const handleMessageClick = (e: React.MouseEvent, msg: any) => {
        if (activeMenuId === msg.id) {
            setActiveMenuId(null);
        } else {
            const rect = e.currentTarget.getBoundingClientRect();
            const isMe = msg.isMe;
            setMenuPosition({
                top: rect.bottom,
                right: isMe ? window.innerWidth - rect.right : rect.left
            });
            setActiveMenuId(msg.id);
        }
    };

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const inPopup = target.closest('.message_actions_popup');
            const inMessageBubble = target.closest('.message_bubble');
            const inEmojiPicker = target.closest('.emoji_reactions_picker');
            const inReactionsSubmenu = target.closest('.reactions_submenu');
            
            if (!inPopup && !inMessageBubble && !inEmojiPicker && !inReactionsSubmenu) {
                setActiveMenuId(null);
            }
        };
        
        window.addEventListener('click', handleClick, true);
        return () => window.removeEventListener('click', handleClick, true);
    }, []);

    return (
        <div className="main_content">
            <header>
                <div className="header_left">
                    <button onClick={() => setShowSidebar(!showSidebar)} className="menu_toggle">
                        <Menu size={20} />
                    </button>
                    {activeChat?.imageUrl ? (
                        <img src={activeChat.imageUrl} alt="" className="chat_avatar" />
                    ) : (
                        <div className="chat_avatar_placeholder">
                            <MessageSquare size={20} />
                        </div>
                    )}
                    <div className="chat_title">
                        <h2>{activeChat?.name || 'Loading...'}</h2>
                        {activeChat?.description && <p>{activeChat.description}</p>}
                    </div>
                </div>
                <div className="header_right">
                    <button 
                        onClick={() => setShowMembersPanel(!showMembersPanel)} 
                        className="chat_settings_btn"
                        title="Members"
                    >
                        <Users size={20} />
                    </button>
                    <button 
                        onClick={() => setIsChatSettingsOpen(true)} 
                        className="chat_settings_btn"
                        title="Chat Settings"
                    >
                        <Settings size={20} />
                    </button>
                </div>
            </header>

            {activeChat?.pinnedMessageId && (
                <div
                    className="pinned_banner"
                    onClick={() => {
                        if (activeChat.pinnedMessageId) {
                            scrollToMessage(activeChat.pinnedMessageId);
                        }
                    }}
                >
                    <Pin size={14} />
                    <div className="pinned_banner_content">
                        <span className="pinned_banner_label">Pinned message</span>
                        <p>{truncateText(getPinnedPreviewText(activePinnedMessage), 80)}</p>
                    </div>
                    <button
                        type="button"
                        className="pinned_banner_unpin"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (activeChat?.id) {
                                unpinMessage(activeChat.id);
                            }
                        }}
                        title="Unpin message"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            <main>
                {messages.length === 0 && (
                    <div className="signal">
                        <WifiOff size={48} className="mb-4" />
                        <p>No transmissions detected.</p>
                        <p className="text-xs mt-2">Waiting for signal...</p>
                    </div>
                )}

                {messages.map((msg) => {
                    if (msg.isSystem) {
                        return (
                            <div key={msg.id} className="status_message">
                                <span>{msg.text}</span>
                            </div>
                        );
                    }
                    
                    return (
                        <MessageBubble
                            key={msg.id}
                            msg={msg}
                            settings={settings}
                            messages={messages}
                            activeMenuId={activeMenuId}
                            menuPosition={menuPosition}
                            userAvatars={userAvatars}
                            users={users}
                            onMessageClick={handleMessageClick}
                            toggleReaction={toggleReaction}
                            onReply={startReply}
                            onForward={handleForward}
                            onDirectMessage={handleDirectMessage}
                            onEdit={startEditing}
                            onDelete={handleDelete}
                            pinnedMessageId={activeChat?.pinnedMessageId || null}
                            onPin={pinMessage}
                            onUnpin={() => unpinMessage(activeChat?.id)}
                            scrollToMessage={scrollToMessage}
                            truncateText={truncateText}
                            onProfileClick={setProfileUser}
                        />
                    );
                })}
                <div ref={messagesEndRef} />
            </main>

            {uploadError && (
                <div className="upload_error">
                    {uploadError}
                    <button onClick={() => setUploadError(null)}>×</button>
                </div>
            )}

            <footer>
                {pendingUpload && (
                    <div className="editing_preview media_mode">
                        <div className="editing_info">
                            <span className="editing_label">File selected</span>
                            <div className="flex items-center gap-2">
                                {pendingUpload.messageType === 'image' && <ImageIcon size={14} className="text-green-400" />}
                                {pendingUpload.messageType === 'video' && <VideoIcon size={14} className="text-blue-400" />}
                                {pendingUpload.messageType === 'audio' && <MusicIcon size={14} className="text-purple-400" />}
                                <p className="editing_text">{pendingUpload.fileName}</p>
                            </div>
                        </div>
                        <button onClick={cancelPendingUpload} className="cancel_edit_button" title="Remove file">
                            <X size={16} />
                        </button>
                    </div>
                )}

                {editingMessageId && (
                    <div className="editing_preview">
                        <div className="editing_info">
                            <span className="editing_label">Editing message</span>
                            <p className="editing_text">
                                {truncateText(messages.find(m => m.id === editingMessageId)?.text || '')}
                            </p>
                        </div>
                        <button onClick={cancelEdit} className="cancel_edit_button" title="Cancel">
                            <X size={16} />
                        </button>
                    </div>
                )}

                {replyingToMessage && (
                    <div className="editing_preview reply_mode">
                        <div className="editing_info">
                            <span className="editing_label">Replying to {replyingToMessage.displayName || replyingToMessage.sender}</span>
                            <p className="editing_text">
                                {truncateText(replyingToMessage.text)}
                            </p>
                        </div>
                        <button onClick={cancelReply} className="cancel_edit_button" title="Cancel">
                            <X size={16} />
                        </button>
                    </div>
                )}
                <form onSubmit={handleSend} className="footer_form">
                    <div className={`input_pill ${isRecording ? 'recording_active' : ''} ${editingMessageId ? 'editing_mode' : ''}`}>
                        {isRecording ? (
                            <div className="recording_container">
                                <div className="recording_indicator animate-pulse">
                                    <div className="recording_dot"></div>
                                    <span className="recording_timer">{formatDuration(recordingDuration)}</span>
                                </div>
                                <div className="recording_text">Recording...</div>
                                <button
                                    type="button"
                                    onClick={cancelRecording}
                                    className="cancel_record_button"
                                    title="Cancel"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    className="sticker_trigger"
                                    onClick={() => setIsStickerPickerOpen(!isStickerPickerOpen)}
                                    title="Stickers"
                                >
                                    <Smile size={20} />
                                </button>

                                {isStickerPickerOpen && (
                                    <StickerPicker
                                        onSelect={(id) => {
                                            sendSticker(id, replyingToMessage?.id);
                                            setIsStickerPickerOpen(false);
                                            setReplyingToMessage(null);
                                        }}
                                        onClose={() => setIsStickerPickerOpen(false)}
                                    />
                                )}

                                <FileUploadButton
                                    serverUrl={settings.serverUrl}
                                    token={token}
                                    disabled={status !== ConnectionStatus.CONNECTED && !settings.isDemoMode}
                                    onUploadComplete={handleUploadComplete}
                                    onError={(error: string) => {
                                        setUploadError(error);
                                        setTimeout(() => setUploadError(null), 5000);
                                    }}
                                />

                                <div className="input_wrapper">
                                    <textarea
                                        ref={inputRef}
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        placeholder={editingMessageId ? "Edit your message..." : replyingToMessage ? "Write a reply..." : (status === ConnectionStatus.CONNECTED || settings.isDemoMode ? "Message" : "Connecting...")}
                                        disabled={status !== ConnectionStatus.CONNECTED && !settings.isDemoMode}
                                        className="message_input"
                                        rows={1}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                handleSend();
                                            } else if (e.key === 'Escape') {
                                                cancelEdit();
                                                cancelReply();
                                            }
                                        }}
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    {isRecording ? (
                        <button
                            type="button"
                            className="send_button recording"
                            onClick={stopRecording}
                        >
                            <Square size={16} fill="white" />
                        </button>
                    ) : (
                        (input.trim() || pendingUpload) ? (
                            <button
                                type="submit"
                                className={`send_button ${editingMessageId ? 'editing' : ''}`}
                                disabled={status !== ConnectionStatus.CONNECTED && !settings.isDemoMode}
                            >
                                {editingMessageId ? <Check size={20} /> : <Send size={20} />}
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="send_button"
                                onClick={startRecording}
                                disabled={status !== ConnectionStatus.CONNECTED && !settings.isDemoMode}
                            >
                                <Mic size={20} />
                            </button>
                        )
                    )}
                </form>
            </footer>

            <ConfirmModal
                isOpen={!!messageToDelete}
                title="Confirm Deletion"
                message="Are you sure you want to permanently delete this message? This action cannot be undone."
                onConfirm={confirmDelete}
                onCancel={() => setMessageToDelete(null)}
                confirmText="Delete"
                cancelText="Abort"
                type="danger"
            />

            <ForwardModal
                isOpen={isForwardModalOpen}
                chats={chats}
                currentChatId={activeChat?.id || null}
                onForward={confirmForward}
                onCancel={() => setIsForwardModalOpen(false)}
            />

            <ChatSettingsModal
                isOpen={isChatSettingsOpen}
                chat={activeChat}
                serverUrl={settings.serverUrl}
                token={token || ''}
                onSave={(chatId, data) => {
                    updateChat(chatId, data);
                    setIsChatSettingsOpen(false);
                }}
                onDelete={(chatId) => {
                    deleteChat(chatId);
                    setIsChatSettingsOpen(false);
                }}
                onCancel={() => setIsChatSettingsOpen(false)}
            />

            {showMembersPanel && activeChat && (
                <ChatMembersPanel
                    chatId={activeChat.id}
                    serverUrl={settings.serverUrl}
                    token={token || ''}
                    onClose={() => setShowMembersPanel(false)}
                />
            )}

            <ProfileModal
                isOpen={!!profileUser}
                user={profileUser}
                onClose={() => setProfileUser(null)}
                onDirectMessage={handleDirectMessage}
            />
        </div>
    );
};
      
