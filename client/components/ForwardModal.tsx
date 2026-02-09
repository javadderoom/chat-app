import React from 'react';
import { createPortal } from 'react-dom';
import { Share2, X, MessageSquare } from 'lucide-react';
import { Chat } from '../types';
import './ForwardModal.css';

interface ForwardModalProps {
    isOpen: boolean;
    chats: Chat[];
    currentChatId: string | null;
    onForward: (chatId: string) => void;
    onCancel: () => void;
}

export const ForwardModal: React.FC<ForwardModalProps> = ({
    isOpen,
    chats,
    currentChatId,
    onForward,
    onCancel,
}) => {
    if (!isOpen) return null;

    // Filter out the current chat
    const availableChats = chats.filter(chat => chat.id !== currentChatId);

    return createPortal(
        <div className="modal_overlay" onClick={onCancel}>
            <div className="modal_content forward_modal animate-scale" onClick={e => e.stopPropagation()}>
                <div className="modal_header">
                    <div className="modal_title">
                        <Share2 size={20} className="text-blue-500" />
                        <h3>Forward Message</h3>
                    </div>
                    <button onClick={onCancel} className="modal_close_btn">
                        <X size={20} />
                    </button>
                </div>
                <div className="modal_body">
                    <p className="modal_subtitle">Select a chat to forward this transmission</p>
                    <div className="forward_chat_list">
                        {availableChats.length > 0 ? (
                            availableChats.map(chat => (
                                <button
                                    key={chat.id}
                                    className="forward_chat_item"
                                    onClick={() => onForward(chat.id)}
                                >
                                    <div className="chat_icon">
                                        <MessageSquare size={18} />
                                    </div>
                                    <div className="chat_info">
                                        <span className="chat_name">{chat.name}</span>
                                        {chat.description && <span className="chat_desc">{chat.description}</span>}
                                    </div>
                                </button>
                            ))
                        ) : (
                            <div className="no_chats_message">
                                No other frequencies detected.
                            </div>
                        )}
                    </div>
                </div>
                <div className="modal_footer">
                    <button onClick={onCancel} className="btn_secondary">
                        Cancel
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
