import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Send, WifiOff, Activity, Mic, Trash2, X, Square, Edit2, Check, Menu, Share2, Image as ImageIcon, Video as VideoIcon, Music as MusicIcon } from 'lucide-react';
import { format } from 'date-fns';
import { FileUploadButton, UploadResult } from './FileUploadButton';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';
import { StickerPicker } from './StickerPicker';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { UserSettings, ConnectionStatus, Message } from '../types';
import './ChatView.css';

import { ConfirmModal } from './ConfirmModal';
import { ForwardModal } from './ForwardModal';

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '🎉'];

interface Chat {
    id: string;
    name: string;
    description?: string;
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
    sendSticker: (stickerId: string) => void;
    chats: Chat[];
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
    chats
}) => {
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

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const prevMessagesLengthRef = useRef(messages.length);

    const truncateText = (text: string, length: number = 20) => {
        if (!text) return '';
        return text.length > length ? text.substring(0, length) + '...' : text;
    };

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
            setMenuPosition({
                top: rect.top,
                right: window.innerWidth - rect.right
            });
            setActiveMenuId(msg.id);
        }
    };

    useEffect(() => {
        const handleEvents = () => setActiveMenuId(null);
        window.addEventListener('scroll', handleEvents, true);
        window.addEventListener('click', (e) => {
            if (!(e.target as HTMLElement).closest('.message_actions_popup') &&
                !(e.target as HTMLElement).closest('.text.me')) {
                handleEvents();
            }
        }, true);
        return () => window.removeEventListener('scroll', handleEvents, true);
    }, []);

    return (
        <div className="main_content">
            <header>
                <div className="header_left">
                    <button onClick={() => setShowSidebar(!showSidebar)} className="menu_toggle">
                        <Menu size={20} />
                    </button>
                    <div className="chat_title">
                        <h2>{activeChat?.name || 'Loading...'}</h2>
                        {activeChat?.description && <p>{activeChat.description}</p>}
                    </div>
                </div>
            </header>

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
                        <div
                            id={`msg-${msg.id}`}
                            key={msg.id}
                            className={`message ${msg.isMe ? 'me' : 'them'} ${msg.messageType === 'sticker' ? 'sticker_msg' : ''}`}
                        >
                            <div className={`info ${msg.isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                <span className={`username text-xs font-bold ${msg.isMe ? 'text-green-400' : 'text-blue-400'}`}>
                                    {msg.sender}
                                </span>
                                <span className="time">
                                    {format(msg.timestamp, 'HH:mm:ss')}
                                </span>
                            </div>

                            <div
                                className={`text ${msg.isMe ? 'me' : 'them'} ${msg.messageType === 'sticker' ? 'sticker_text' : ''} relative group cursor-pointer`}
                                onClick={(e) => handleMessageClick(e, msg)}
                            >
                                {activeMenuId === msg.id && createPortal(
                                    <div
                                        className="message_actions_wrapper"
                                        style={{
                                            top: `${menuPosition.top}px`,
                                            right: `${menuPosition.right}px`
                                        }}
                                    >
                                        <div
                                            className="message_actions_popup"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <div className="emoji_reactions_picker">
                                                {EMOJIS.map(emoji => (
                                                    <button
                                                        key={emoji}
                                                        className={`emoji_btn ${msg.reactions?.[emoji]?.includes(settings.username) ? 'active' : ''}`}
                                                        onClick={(e) => { e.stopPropagation(); toggleReaction(msg.id, emoji); setActiveMenuId(null); }}
                                                    >
                                                        {emoji}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="menu_divider"></div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); startReply(msg); }}
                                                className="menu_item"
                                            >
                                                <Mic size={14} style={{ transform: 'rotate(180deg)' }} />
                                                <span>Reply</span>
                                            </button>

                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleForward(msg); }}
                                                className="menu_item"
                                            >
                                                <Share2 size={14} />
                                                <span>Forward</span>
                                            </button>

                                            {msg.isMe && (
                                                <>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); startEditing(msg); setActiveMenuId(null); }}
                                                        className="menu_item"
                                                    >
                                                        <Edit2 size={14} />
                                                        <span>Edit</span>
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDelete(msg.id); }}
                                                        className="menu_item delete"
                                                    >
                                                        <Trash2 size={14} />
                                                        <span>Delete</span>
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>,
                                    document.body
                                )}

                                {msg.isForwarded && (
                                    <div className="forwarded_label">
                                        <Share2 size={10} />
                                        <span>Forwarded from {msg.forwardedFrom}</span>
                                    </div>
                                )}

                                {msg.replyToId && (
                                    <div
                                        className="reply_reference"
                                        onClick={(e) => { e.stopPropagation(); scrollToMessage(msg.replyToId!); }}
                                    >
                                        <div className="reply_line"></div>
                                        <div className="reply_content_preview">
                                            <span className="reply_user">
                                                {messages.find(m => m.id === msg.replyToId)?.sender || 'Message'}
                                            </span>
                                            <p className="reply_text">
                                                {truncateText(messages.find(m => m.id === msg.replyToId)?.text || 'Original message not found')}
                                            </p>
                                        </div>
                                    </div>
                                )}
                                {msg.messageType === 'image' && msg.mediaUrl && (
                                    <div className="media_content">
                                        <img
                                            src={msg.mediaUrl}
                                            alt={msg.fileName || 'Image'}
                                            className="media_image"
                                            onClick={() => window.open(msg.mediaUrl, '_blank')}
                                        />
                                    </div>
                                )}

                                {msg.messageType === 'video' && msg.mediaUrl && (
                                    <div className="media_content">
                                        <video
                                            src={msg.mediaUrl}
                                            controls
                                            className="media_video"
                                        />
                                    </div>
                                )}

                                {(msg.messageType === 'audio' || msg.messageType === 'voice') && msg.mediaUrl && (
                                    <div className="media_content">
                                        {msg.fileName && (
                                            <div className="media_filename">
                                                {truncateText(msg.fileName)}
                                            </div>
                                        )}
                                        <VoiceMessagePlayer
                                            src={msg.mediaUrl}
                                            duration={msg.mediaDuration}
                                        />
                                    </div>
                                )}

                                {msg.messageType === 'sticker' && msg.stickerId && (
                                    <div className="sticker_container">
                                        <img
                                            src={`/stickers/${msg.stickerId}.svg`}
                                            alt="sticker"
                                            className="sticker_image"
                                        />
                                    </div>
                                )}

                                {(msg.text && msg.messageType !== 'sticker' && (!msg.mediaUrl || (!msg.text.startsWith('[IMAGE]') && !msg.text.startsWith('[VIDEO]') && !msg.text.startsWith('[AUDIO]') && !msg.text.startsWith('[FILE]')))) && (
                                    <div className="message_text_content">
                                        {msg.text}
                                        {msg.updatedAt && <span className="text-[10px] text-gray-500 ml-2 italic">(edited)</span>}
                                    </div>
                                )}

                                {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                                    <div className="message_reactions">
                                        {Object.entries(msg.reactions).map(([emoji, reactors]) => {
                                            const users = reactors as string[];
                                            return (
                                                <div
                                                    key={emoji}
                                                    className={`reaction_pill ${users.includes(settings.username) ? 'active' : ''}`}
                                                    onClick={(e) => { e.stopPropagation(); toggleReaction(msg.id, emoji); }}
                                                    title={users.join(', ')}
                                                >
                                                    <span className="reaction_emoji">{emoji}</span>
                                                    <span className="reaction_count">{users.length}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
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
                            <span className="editing_label">Replying to {replyingToMessage.sender}</span>
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
                                    <Activity size={20} />
                                </button>

                                {isStickerPickerOpen && (
                                    <StickerPicker
                                        onSelect={(id) => {
                                            sendSticker(id);
                                            setIsStickerPickerOpen(false);
                                        }}
                                        onClose={() => setIsStickerPickerOpen(false)}
                                    />
                                )}

                                <FileUploadButton
                                    serverUrl={settings.serverUrl}
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
        </div>
    );
};
