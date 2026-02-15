import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Settings, X, Image as ImageIcon, Upload, UserPlus, Trash2 } from 'lucide-react';
import { Chat, UserInfo } from '../types';
import './ChatSettingsModal.css';

interface ChatMember {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    role: string;
    joinedAt: string;
}

interface ChatSettingsModalProps {
    isOpen: boolean;
    chat: Chat | undefined;
    serverUrl: string;
    token: string;
    onSave: (chatId: string, data: { name?: string; description?: string; imageUrl?: string }) => void;
    onCancel: () => void;
}

export const ChatSettingsModal: React.FC<ChatSettingsModalProps> = ({
    isOpen,
    chat,
    serverUrl,
    token,
    onSave,
    onCancel,
}) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const [members, setMembers] = useState<ChatMember[]>([]);
    const [newMemberUsername, setNewMemberUsername] = useState('');
    const [isLoadingMembers, setIsLoadingMembers] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (chat) {
            setName(chat.name);
            setDescription(chat.description || '');
            setAvatarUrl(chat.imageUrl || '');
            setSelectedFile(null);
            setError('');
            fetchMembers();
        }
    }, [chat, token, serverUrl]);

    const fetchMembers = async () => {
        if (!chat) return;
        setIsLoadingMembers(true);
        try {
            const response = await fetch(`${serverUrl}/api/chats/${chat.id}/members`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setMembers(data);
            }
        } catch (err) {
            console.error('Error fetching members:', err);
        } finally {
            setIsLoadingMembers(false);
        }
    };

    const handleAddMember = async (e: React.FormEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!chat || !newMemberUsername.trim()) return;
        
        setError('');
        try {
            const response = await fetch(`${serverUrl}/api/chats/${chat.id}/members`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username: newMemberUsername.trim() })
            });
            
            if (response.ok) {
                setNewMemberUsername('');
                fetchMembers();
            } else {
                const data = await response.json();
                setError(data.error || 'Failed to add member');
            }
        } catch (err) {
            setError('Failed to add member');
        }
    };

    const handleRemoveMember = async (userId: string) => {
        if (!chat) return;
        
        try {
            const response = await fetch(`${serverUrl}/api/chats/${chat.id}/members/${userId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                fetchMembers();
            }
        } catch (err) {
            console.error('Error removing member:', err);
        }
    };

    const getPreviewUrl = () => {
        if (selectedFile) {
            return URL.createObjectURL(selectedFile);
        }
        if (avatarUrl) {
            return avatarUrl;
        }
        return null;
    };

    if (!isOpen || !chat) return null;

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setSelectedFile(file);

        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch(`${serverUrl}/api/upload/image`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
                body: formData,
            });

            if (response.ok) {
                const data = await response.json();
                const url = data.mediaUrl || data.url;
                if (url) {
                    const fullUrl = url.startsWith('http') ? url : `${serverUrl}${url}`;
                    setAvatarUrl(fullUrl);
                }
                setSelectedFile(null);
            } else {
                console.error('Upload failed:', response.status);
                setSelectedFile(null);
            }
        } catch (error) {
            console.error('Upload error:', error);
            setSelectedFile(null);
        } finally {
            setIsUploading(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        onSave(chat.id, {
            name: name.trim(),
            description: description.trim() || undefined,
            imageUrl: avatarUrl || undefined,
        });
    };

    return createPortal(
        <div className="modal_overlay" onClick={onCancel}>
            <div className="modal_content chat_settings_modal animate-scale" onClick={e => e.stopPropagation()}>
                <div className="modal_header">
                    <div className="modal_title">
                        <Settings size={20} className="text-blue-500" />
                        <h3>Chat Settings</h3>
                    </div>
                    <button onClick={onCancel} className="modal_close_btn">
                        <X size={20} />
                    </button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal_body">
                        <div className="avatar_upload_section">
                            <div className="avatar_preview">
                                {getPreviewUrl() ? (
                                    <img src={getPreviewUrl()!} alt="Chat avatar" />
                                ) : (
                                    <div className="avatar_placeholder">
                                        <ImageIcon size={32} />
                                    </div>
                                )}
                            </div>
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleImageUpload}
                                accept="image/*"
                                className="hidden"
                            />
                            <button
                                type="button"
                                className="upload_avatar_btn"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploading}
                            >
                                <Upload size={16} />
                                {isUploading ? 'Uploading...' : 'Upload Image'}
                            </button>
                        </div>

                        <div className="form_group">
                            <label>Chat Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="Enter chat name"
                                autoFocus
                            />
                        </div>

                        <div className="form_group">
                            <label>Description</label>
                            <textarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="Enter chat description (optional)"
                                rows={3}
                            />
                        </div>

                        <div className="form_group">
                            <label>Members</label>
                            {isLoadingMembers ? (
                                <div className="members_loading">Loading members...</div>
                            ) : (
                                <div className="members_list">
                                    {members.map(member => (
                                        <div key={member.id} className="member_item">
                                            <div className="member_avatar">
                                                {member.avatarUrl ? (
                                                    <img src={member.avatarUrl} alt="" />
                                                ) : (
                                                    member.username.charAt(0).toUpperCase()
                                                )}
                                            </div>
                                            <div className="member_info">
                                                <span className="member_name">{member.displayName || member.username}</span>
                                                <span className="member_username">@{member.username}</span>
                                            </div>
                                            <span className="member_role">{member.role}</span>
                                            {member.role !== 'admin' && (
                                                <button
                                                    className="member_remove_btn"
                                                    onClick={() => handleRemoveMember(member.id)}
                                                    title="Remove member"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                            
                            <div onSubmit={handleAddMember} className="add_member_form">
                                <input
                                    type="text"
                                    value={newMemberUsername}
                                    onChange={e => setNewMemberUsername(e.target.value)}
                                    placeholder="Add member by username"
                                />
                                <button type="button" disabled={!newMemberUsername.trim()} onClick={handleAddMember}>
                                    <UserPlus size={16} />
                                </button>
                            </div>
                            {error && <div className="member_error">{error}</div>}
                        </div>
                    </div>
                    <div className="modal_footer">
                        <button type="button" onClick={onCancel} className="btn_secondary">
                            Cancel
                        </button>
                        <button type="submit" className="btn_primary">
                            Save Changes
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};
