import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Send, WifiOff, Activity, Mic, Trash2, X, Square, Edit2, Check, Menu } from 'lucide-react';
import { format } from 'date-fns';
import { FileUploadButton, UploadResult } from './FileUploadButton';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { UserSettings, ConnectionStatus, Message } from '../types';
import './ChatView.css';

import { ConfirmModal } from './ConfirmModal';

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
    setShowServerHelp
}) => {
    const [input, setInput] = useState('');
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
    const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null);
    const [menuPosition, setMenuPosition] = useState<{ top: number, right: number }>({ top: 0, right: 0 });
    const [messageToDelete, setMessageToDelete] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim() && !settings.isDemoMode) return;

        if (editingMessageId) {
            editMessage(editingMessageId, input);
            setEditingMessageId(null);
        } else {
            sendMessage(input, replyingToMessage?.id);
            setReplyingToMessage(null);
        }
        setInput('');
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
            sendMediaMessage(data, replyingToMessage?.id);
            setReplyingToMessage(null);
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
                            className={`message ${msg.isMe ? 'me' : 'them'}`}
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
                                className={`text ${msg.isMe ? 'me' : 'them'} relative group cursor-pointer`}
                                onClick={(e) => handleMessageClick(e, msg)}
                            >
                                {activeMenuId === msg.id && createPortal(
                                    <div
                                        className="message_actions_popup"
                                        style={{
                                            top: `${menuPosition.top}px`,
                                            right: `${menuPosition.right}px`,
                                            transform: 'translateY(-100%) translateY(-8px)'
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <button
                                            onClick={(e) => { e.stopPropagation(); startReply(msg); }}
                                            className="menu_item"
                                        >
                                            <Mic size={14} style={{ transform: 'rotate(180deg)' }} />
                                            <span>Reply</span>
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
                                    </div>,
                                    document.body
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
                                                {messages.find(m => m.id === msg.replyToId)?.text || 'Original message not found'}
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
                                        <VoiceMessagePlayer
                                            src={msg.mediaUrl}
                                            duration={msg.mediaDuration}
                                        />
                                    </div>
                                )}

                                {!msg.mediaUrl && msg.text && (
                                    <div className="message_text_content">
                                        {msg.text}
                                        {msg.updatedAt && <span className="text-[10px] text-gray-500 ml-2 italic">(edited)</span>}
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
                {editingMessageId && (
                    <div className="editing_preview">
                        <div className="editing_info">
                            <span className="editing_label">Editing message</span>
                            <p className="editing_text">
                                {messages.find(m => m.id === editingMessageId)?.text}
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
                                {replyingToMessage.text}
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
                                <FileUploadButton
                                    serverUrl={settings.serverUrl}
                                    disabled={status !== ConnectionStatus.CONNECTED && !settings.isDemoMode}
                                    onUploadComplete={(data: UploadResult) => {
                                        setUploadError(null);
                                        sendMediaMessage(data, replyingToMessage?.id);
                                        setReplyingToMessage(null);
                                    }}
                                    onError={(error: string) => {
                                        setUploadError(error);
                                        setTimeout(() => setUploadError(null), 5000);
                                    }}
                                />

                                <div className="input_wrapper">
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        placeholder={editingMessageId ? "Edit your message..." : replyingToMessage ? "Write a reply..." : (status === ConnectionStatus.CONNECTED || settings.isDemoMode ? "Message" : "Connecting...")}
                                        disabled={status !== ConnectionStatus.CONNECTED && !settings.isDemoMode}
                                        className="message_input"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Escape') {
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
                        input.trim() ? (
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
        </div>
    );
};
