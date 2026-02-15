import React from 'react';
import { createPortal } from 'react-dom';
import { X, MessageCircle } from 'lucide-react';
import { UserInfo } from '../types';
import './ProfileModal.css';

interface ProfileModalProps {
    isOpen: boolean;
    user: {
        username: string;
        displayName: string;
        avatarUrl?: string;
    } | null;
    onClose: () => void;
    onDirectMessage: (username: string) => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
    isOpen,
    user,
    onClose,
    onDirectMessage
}) => {
    if (!isOpen || !user) return null;

    const handleDirectMessage = () => {
        onDirectMessage(user.username);
        onClose();
    };

    return createPortal(
        <div className="modal_overlay" onClick={onClose}>
            <div className="profile_modal animate-scale" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="modal_close_btn profile_close_btn">
                    <X size={20} />
                </button>
                
                <div className="profile_avatar">
                    {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt={user.displayName} />
                    ) : (
                        <div className="profile_avatar_placeholder">
                            {user.displayName.charAt(0).toUpperCase()}
                        </div>
                    )}
                </div>
                
                <h2 className="profile_display_name">{user.displayName}</h2>
                <p className="profile_username">@{user.username}</p>
                
                <button 
                    className="profile_dm_button"
                    onClick={handleDirectMessage}
                >
                    <MessageCircle size={16} />
                    <span>Send Message</span>
                </button>
            </div>
        </div>,
        document.body
    );
};
