import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Settings, X, Image as ImageIcon, Upload } from 'lucide-react';
import { Chat } from '../types';
import './ChatSettingsModal.css';

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

    React.useEffect(() => {
        if (chat) {
            setName(chat.name);
            setDescription(chat.description || '');
            setAvatarUrl(chat.imageUrl || '');
            setSelectedFile(null);
        }
    }, [chat]);

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
