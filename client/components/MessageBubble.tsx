import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Mic, Share2, Edit2, Trash2, Smile } from 'lucide-react';
import { format } from 'date-fns';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';
import { AnimatedSticker } from './AnimatedSticker';
import { Message, UserSettings } from '../types';

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '🎉'];

interface MessageBubbleProps {
    msg: Message;
    settings: UserSettings;
    messages: Message[];
    activeMenuId: string | null;
    menuPosition: { top: number; right: number };
    userAvatars: Record<string, string>;
    users: Record<string, { avatarUrl?: string; displayName: string }>;
    onMessageClick: (e: React.MouseEvent, msg: Message) => void;
    toggleReaction: (messageId: string, emoji: string) => void;
    onReply: (msg: Message) => void;
    onForward: (msg: Message) => void;
    onEdit: (msg: Message) => void;
    onDelete: (id: string) => void;
    scrollToMessage: (id: string) => void;
    truncateText: (text: string, length?: number) => string;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
    msg,
    settings,
    messages,
    activeMenuId,
    menuPosition,
    userAvatars,
    users,
    onMessageClick,
    toggleReaction,
    onReply,
    onForward,
    onEdit,
    onDelete,
    scrollToMessage,
    truncateText,
}) => {
    const [showReactionsList, setShowReactionsList] = useState(false);
    return (
        <div
            id={`msg-${msg.id}`}
            className={`message ${msg.isMe ? 'me' : 'them'} ${msg.messageType === 'sticker' ? 'sticker_msg' : ''}`}
        >   
            {!msg.isMe && (
                <div className="message_avatar">
                    {userAvatars[msg.sender] ? (
                        <img src={userAvatars[msg.sender]} alt="" />
                    ) : (
                        <div className="message_avatar_placeholder">
                            {(msg.displayName || msg.sender).charAt(0).toUpperCase()}
                        </div>
                    )}
                </div>
            )}
            <div className="message_content">
                {!msg.isMe && (
                    <div className="message_sender_name">
                        {msg.displayName || msg.sender}
                    </div>
                )}
                <div className={`message_bubble ${msg.isMe ? 'me' : 'them'}`}>
                    <div
                        className={`text ${msg.isMe ? 'me' : 'them'} ${msg.messageType === 'sticker' ? 'sticker_text' : ''} relative group cursor-pointer`}
                        onClick={(e) => onMessageClick(e, msg)}
                    >
                        {activeMenuId === msg.id && createPortal(
                            <div
                                className="message_actions_wrapper"
                                style={{
                                    top: `${menuPosition.top}px`,
                                    [msg.isMe ? 'right' : 'left']: `${menuPosition.right}px`
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
                                                onClick={(e) => { e.stopPropagation(); toggleReaction(msg.id, emoji); onMessageClick(e as any, msg); }}
                                            >
                                                {emoji}
                                            </button>
                                        ))}
                                    </div>
                                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                                        <>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setShowReactionsList(!showReactionsList); }}
                                                className="menu_item"
                                            >
                                                <Smile size={14} />
                                                <span>Reactions</span>
                                            </button>
                                            {showReactionsList && (
                                                <div className="reactions_submenu">
                                                    {Object.entries(msg.reactions).map(([emoji, reactors]) => {
                                                        const reactorList = reactors as string[];
                                                        return reactorList.map((user) => {
                                                            const userData = users[user.toLowerCase()];
                                                            const avatarUrl = userData?.avatarUrl;
                                                            return (
                                                                <div key={`${emoji}-${user}`} className="reaction_user">
                                                                    <div className="reaction_user_avatar">
                                                                        {avatarUrl ? (
                                                                            <img src={avatarUrl} alt="" />
                                                                        ) : (
                                                                            user.charAt(0).toUpperCase()
                                                                        )}
                                                                    </div>
                                                                    <span className="reaction_user_name">{userData?.displayName || user}</span>
                                                                    <span className="reaction_user_emoji">{emoji}</span>
                                                                </div>
                                                            );
                                                        });
                                                    })}
                                                </div>
                                            )}
                                        </>
                                    )}
                                    <div className="menu_divider"></div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onReply(msg); }}
                                        className="menu_item"
                                    >
                                        <Mic size={14} style={{ transform: 'rotate(180deg)' }} />
                                        <span>Reply</span>
                                    </button>

                                    <button
                                        onClick={(e) => { e.stopPropagation(); onForward(msg); }}
                                        className="menu_item"
                                    >
                                        <Share2 size={14} />
                                        <span>Forward</span>
                                    </button>

                                    {msg.isMe && (
                                        <>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onEdit(msg); onMessageClick(e as any, msg); }}
                                                className="menu_item"
                                            >
                                                <Edit2 size={14} />
                                                <span>Edit</span>
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onDelete(msg.id); }}
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
                                        {messages.find(m => m.id === msg.replyToId)?.displayName || messages.find(m => m.id === msg.replyToId)?.sender || 'Message'}
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
                                {(msg.stickerId.endsWith('.tgs') || msg.stickerId.endsWith('.json')) ? (
                                    <AnimatedSticker
                                        src={`/stickers/${msg.stickerId}`}
                                        className="sticker_image"
                                    />
                                ) : msg.stickerId.endsWith('.webm') ? (
                                    <video
                                        src={`/stickers/${msg.stickerId}`}
                                        className="sticker_image"
                                        autoPlay
                                        loop
                                        muted
                                        playsInline
                                    />
                                ) : (
                                    <img
                                        src={msg.stickerId.includes('.') ? `/stickers/${msg.stickerId}` : `/stickers/${msg.stickerId}.svg`}
                                        alt="sticker"
                                        className="sticker_image"
                                    />
                                )}
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
                    <div className="message_footer">
                        <span className="time">
                            {format(msg.timestamp, 'HH:mm:ss')}
                        </span>
                    </div>
                </div>
            </div>

            
        </div>
    );
};
