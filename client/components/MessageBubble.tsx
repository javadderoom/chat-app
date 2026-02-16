import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Mic, Share2, Edit2, Trash2, Smile, MessageCircle, Pin, PinOff, Check, CheckCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';
import { AnimatedSticker } from './AnimatedSticker';
import { Message, UserSettings, UserInfo } from '../types';

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '🎉', '😎', '😍', '🤔', '😅', '🤣', '😭', '💀', '👀', '🙄', '😴', '🤯', '🥳', '😇', '🤡', '👻', '💩', '🍌', '🍕', '🚀', '⭐', '💯', '✅'];

const isRTL = (text: string): boolean => {
    const persianRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    return persianRegex.test(text);
};

interface MessageBubbleProps {
    msg: Message;
    settings: UserSettings;
    messages: Message[];
    activeMenuId: string | null;
    menuPosition: { top: number; right: number };
    userAvatars: Record<string, string>;
    users: Record<string, UserInfo>;
    onMessageClick: (e: React.MouseEvent, msg: Message) => void;
    toggleReaction: (messageId: string, emoji: string) => void;
    onReply: (msg: Message) => void;
    onForward: (msg: Message) => void;
    onDirectMessage: (username: string) => void;
    onEdit: (msg: Message) => void;
    onDelete: (id: string) => void;
    pinnedMessageId?: string | null;
    onPin: (id: string) => void;
    onUnpin: () => void;
    scrollToMessage: (id: string) => void;
    truncateText: (text: string, length?: number) => string;
    onProfileClick?: (user: { username: string; displayName: string; avatarUrl?: string }) => void;
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
    onDirectMessage,
    onEdit,
    onDelete,
    pinnedMessageId,
    onPin,
    onUnpin,
    scrollToMessage,
    truncateText,
    onProfileClick,
}) => {
    const [showReactionsList, setShowReactionsList] = useState(false);
    const [showSeenByList, setShowSeenByList] = useState(false);
    const hasMedia = msg.messageType === 'image' || msg.messageType === 'video' || msg.messageType === 'audio' || msg.messageType === 'voice';
    const seenBy = msg.seenBy || [];
    const hasSeen = seenBy.length > 0;
    const hasDelivered = (msg.deliveredCount || 0) > 0;
    
    return (
        <div
            id={`msg-${msg.id}`}
            className={`message_wrapper ${msg.isMe ? 'me' : 'them'} ${msg.messageType === 'sticker' ? 'sticker_msg' : ''}`}
            onClick={(e: React.MouseEvent) => onMessageClick(e, msg)}
        >   
            {!msg.isMe && (
                <div 
                    className="message_avatar"
                    onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        onProfileClick?.({
                            username: msg.sender,
                            displayName: msg.displayName || msg.sender,
                            avatarUrl: userAvatars[msg.sender.toLowerCase()]
                        });
                    }}
                >
                    {userAvatars[msg.sender.toLowerCase()] && userAvatars[msg.sender.toLowerCase()] !== '' ? (
                        <img src={userAvatars[msg.sender.toLowerCase()]} alt="" />
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
                <div className={`message_bubble ${msg.isMe ? 'me' : 'them'} ${hasMedia ? 'has_media' : ''}`}>
                    <div
                        className={`text ${msg.isMe ? 'me' : 'them'} ${msg.messageType === 'sticker' ? 'sticker_text' : ''} relative group`}
                    >
                        {activeMenuId === msg.id && createPortal(
                            <>
                                <div
                                    className="message_actions_backdrop"
                                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); onMessageClick(e, msg); }}
                                />
                                <div
                                    className="message_actions_wrapper"
                                    style={{
                                        top: `${menuPosition.top}px`,
                                        [msg.isMe ? 'right' : 'left']: `${menuPosition.right}px`
                                    }}
                                >
                                    <div
                                        className="message_actions_popup"
                                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                    >
                                    <div className="emoji_reactions_picker">
                                        {EMOJIS.map(emoji => (
                                            <button
                                                key={emoji}
                                                className={`emoji_btn ${msg.reactions?.[emoji]?.includes(settings.username) ? 'active' : ''}`}
                                                onClick={(e: React.MouseEvent) => { e.stopPropagation(); toggleReaction(msg.id, emoji); onMessageClick(e, msg); }}
                                            >
                                                {emoji}
                                            </button>
                                        ))}
                                    </div>
                                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                                        <>
                                            <button
                                                onClick={(e: React.MouseEvent) => { e.stopPropagation(); setShowReactionsList(!showReactionsList); }}
                                                className="menu_item"
                                            >
                                                <Smile size={14} />
                                                <span>Reactions</span>
                                            </button>
                                            {showReactionsList && (
                                                <div className="reactions_submenu">
                                                    {Object.entries(msg.reactions ?? {}).map(([emoji, reactors]: [string, string[]]) => {
                                                        return reactors.map((user: string) => {
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

                                    {(msg.isMe && (hasDelivered || hasSeen)) && (
                                        <>
                                            <div className="menu_divider"></div>
                                            <div className="menu_section">
                                                <button
                                                    type="button"
                                                    className="menu_seen_toggle"
                                                    onClick={(e: React.MouseEvent) => {
                                                        e.stopPropagation();
                                                        setShowSeenByList(!showSeenByList);
                                                    }}
                                                >
                                                    <span className="menu_section_title">Seen by</span>
                                                    {showSeenByList ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                </button>
                                                <div className={`menu_seen_content ${showSeenByList ? 'open' : ''}`}>
                                                    {hasSeen ? (
                                                        <div className="menu_seen_list">
                                                            {seenBy.map((name) => (
                                                                <div key={name} className="menu_seen_item">
                                                                    {name}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="menu_seen_empty">No one has seen this message yet</div>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                    <div className="menu_divider"></div>
                                    <button
                                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); onReply(msg); }}
                                        className="menu_item"
                                    >
                                        <Mic size={14} style={{ transform: 'rotate(180deg)' }} />
                                        <span>Reply</span>
                                    </button>

                                    <button
                                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); onForward(msg); }}
                                        className="menu_item"
                                    >
                                        <Share2 size={14} />
                                        <span>Forward</span>
                                    </button>

                                    {pinnedMessageId === msg.id ? (
                                        <button
                                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); onUnpin(); onMessageClick(e, msg); }}
                                            className="menu_item"
                                        >
                                            <PinOff size={14} />
                                            <span>Unpin</span>
                                        </button>
                                    ) : (
                                        <button
                                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); onPin(msg.id); onMessageClick(e, msg); }}
                                            className="menu_item"
                                        >
                                            <Pin size={14} />
                                            <span>Pin</span>
                                        </button>
                                    )}

                                    {!msg.isMe && (
                                        <button
                                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDirectMessage(msg.sender); }}
                                            className="menu_item"
                                        >
                                            <MessageCircle size={14} />
                                            <span>Direct Message</span>
                                        </button>
                                    )}

                                    {msg.isMe && (
                                        <>
                                            <button
                                                onClick={(e: React.MouseEvent) => { e.stopPropagation(); onEdit(msg); onMessageClick(e, msg); }}
                                                className="menu_item"
                                            >
                                                <Edit2 size={14} />
                                                <span>Edit</span>
                                            </button>
                                            <button
                                                onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDelete(msg.id); }}
                                                className="menu_item delete"
                                            >
                                                <Trash2 size={14} />
                                                <span>Delete</span>
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                            </>,
                            document.body
                        )}

                        {msg.isForwarded && (
                            <div className="forwarded_label">
                                <Share2 size={10} />
                                <span>Forwarded from {msg.displayName}</span>
                            </div>
                        )}

                        {pinnedMessageId === msg.id && (
                            <div className="pinned_label">
                                <Pin size={10} />
                                <span>Pinned</span>
                            </div>
                        )}

                        {msg.replyToId && (
                            <div
                                className="reply_reference"
                                onClick={(e: React.MouseEvent) => { e.stopPropagation(); scrollToMessage(msg.replyToId!); }}
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
                            <div className="media_content" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                                <img
                                    src={msg.mediaUrl}
                                    alt={msg.fileName || 'Image'}
                                    className="media_image"
                                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); window.open(msg.mediaUrl, '_blank'); }}
                                />
                            </div>
                        )}

                        {msg.messageType === 'video' && msg.mediaUrl && (
                            <div className="media_content" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                                <video
                                    src={msg.mediaUrl}
                                    controls
                                    className="media_video"
                                />
                            </div>
                        )}

                        {(msg.messageType === 'audio' || msg.messageType === 'voice') && msg.mediaUrl && (
                            <div className="media_content" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
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
                            <div 
                                className={`message_text_content ${hasMedia ? 'media_caption' : ''}`} 
                                style={{ direction: isRTL(msg.text) ? 'rtl' : 'ltr', textAlign: isRTL(msg.text) ? 'right' : 'left' }}
                            >
                                {msg.text}
                            </div>
                        )}

                     
                    </div>
                    <div className="message_footer">
                           {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                            <div className="message_reactions">
                                {Object.entries(msg.reactions).map(([emoji, reactors]: [string, string[]]) => {
                                    return (
                                        <div
                                            key={emoji}
                                            className={`reaction_pill ${reactors.includes(settings.username) ? 'active' : ''}`}
                                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); toggleReaction(msg.id, emoji); }}
                                            title={reactors.join(', ')}
                                        >
                                            <span className="reaction_emoji">{emoji}</span>
                                            <span className="reaction_count">{reactors.length}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        <span className="time">
                            {format(msg.timestamp, 'HH:mm:ss')}
                            {msg.updatedAt && <span className="edited_marker">(edited)</span>}
                        </span>
                        {msg.isMe && (hasDelivered || hasSeen) && (
                            <span
                                className={`receipt_status_icon ${hasSeen ? 'seen' : 'delivered'}`}
                                title={hasSeen ? `Seen by ${seenBy.join(', ')}` : 'Delivered'}
                            >
                                {hasSeen ? <CheckCheck size={12} /> : <Check size={12} />}
                            </span>
                        )}
                        
                    </div>
                </div>
            </div>

            
        </div>
    );
};
