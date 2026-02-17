import React, { useState } from 'react';
import { Terminal, Plus, MessageSquare, X, Settings, LogOut, User } from 'lucide-react';
import './ChatList.css';

interface Chat {
    id: string;
    name: string;
    description?: string;
    imageUrl?: string;
}

interface User {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
}

interface ChatListProps {
    chats: Chat[];
    activeChatId: string | null;
    setActiveChatId: (id: string) => void;
    status: string;
    createChat: (name: string, description: string, isPrivate?: boolean) => void;
    setShowSidebar: (show: boolean) => void;
    onOpenSettings: () => void;
    user?: User;
    onLogout?: () => void;
    unreadCounts?: Record<string, number>;
}

export const ChatList: React.FC<ChatListProps> = ({
    chats,
    activeChatId,
    setActiveChatId,
    status,
    createChat,
    setShowSidebar,
    onOpenSettings,
    user,
    onLogout,
    unreadCounts = {}
}) => {
    const [showNewChatModal, setShowNewChatModal] = useState(false);
    const [newChatName, setNewChatName] = useState('');
    const [newChatDesc, setNewChatDesc] = useState('');
    const [newChatPrivate, setNewChatPrivate] = useState(false);

    const handleCreateChat = (e: React.FormEvent) => {
        e.preventDefault();
        if (newChatName.trim()) {
            createChat(newChatName.trim(), newChatDesc.trim(), newChatPrivate);
            setNewChatName('');
            setNewChatDesc('');
            setNewChatPrivate(false);
            setShowNewChatModal(false);
        }
    };

    return (
        <>
            <aside className="sidebar">
                <div className="sidebar_header">
                    <div className="logo">
                        <Terminal size={20} />
                        <span>Blackout</span>
                    </div>
                    <button onClick={() => setShowNewChatModal(true)} className="add_chat_button" title="New Transmission">
                        <Plus size={20} />
                    </button>
                    <button onClick={() => setShowSidebar(false)} className="close_sidebar_button" title="Close Sidebar">
                        <X size={20} />
                    </button>
                </div>

                <div className="chat_list">
                    {chats.map(chat => (
                        <div
                            key={chat.id}
                            className={`chat_item ${activeChatId === chat.id ? 'active' : ''}`}
                            onClick={() => {
                                setActiveChatId(chat.id);
                                if (window.innerWidth < 768) setShowSidebar(false);
                            }}
                        >
                            <div className="chat_icon">
                                {chat.imageUrl ? (
                                    <img src={chat.imageUrl} alt="" className="chat_list_avatar" />
                                ) : (
                                    <MessageSquare size={16} />
                                )}
                            </div>
                            <div className="chat_info">
                                <span className="chat_name">{chat.name}</span>
                                {chat.description && <span className="chat_desc">{chat.description}</span>}
                            </div>
                            {unreadCounts[chat.id] > 0 && activeChatId !== chat.id && (
                                <div className="chat_unread_badge">{unreadCounts[chat.id]}</div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="sidebar_footer">
                    <div className="connection_status">
                        <div className={`status_dot ${status.toLowerCase()}`}></div>
                        <span>{status}</span>
                    </div>
                    <div className="footer_user_section">
                        {user && (
                            <div className="user_info" title={`${user.displayName} (@${user.username})`}>
                                {user.avatarUrl ? (
                                    <img src={user.avatarUrl} alt="" className="user_avatar_footer" />
                                ) : (
                                    <div className="user_icon_footer">
                                        <User size={16} />
                                    </div>
                                )}
                                <span className="user_display_name">{user.displayName}</span>
                            </div>
                        )}
                        <div className="footer_actions">
                            {onLogout && (
                                <button onClick={onLogout} className="footer_logout_button" title="Logout">
                                    <LogOut size={16} />
                                </button>
                            )}
                            <button onClick={onOpenSettings} className="footer_settings_button" title="Settings">
                                <Settings size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            </aside>

            {/* New Chat Modal */}
            {showNewChatModal && (
                <div className="modal_overlay" onClick={() => setShowNewChatModal(false)}>
                    <div className="modal_content" onClick={e => e.stopPropagation()}>
                        <div className="modal_header">
                            <h3>Initiate New Transmission</h3>
                            <button onClick={() => setShowNewChatModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleCreateChat}>
                            <div className="form_group">
                                <label>Frequency Name</label>
                                <input
                                    type="text"
                                    value={newChatName}
                                    onChange={e => setNewChatName(e.target.value)}
                                    placeholder="e.g. Sector 7, Alpha Team..."
                                    autoFocus
                                />
                            </div>
                            <div className="form_group">
                                <label>Description (Optional)</label>
                                <input
                                    type="text"
                                    value={newChatDesc}
                                    onChange={e => setNewChatDesc(e.target.value)}
                                    placeholder="Broadcast details..."
                                />
                            </div>
                            <div className="form_group checkbox_group">
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={newChatPrivate}
                                        onChange={e => setNewChatPrivate(e.target.checked)}
                                    />
                                    <span>Private (only invited members can see)</span>
                                </label>
                            </div>
                            <div className="modal_actions">
                                <button type="button" onClick={() => setShowNewChatModal(false)} className="cancel_button">Abort</button>
                                <button type="submit" className="confirm_button" disabled={!newChatName.trim()}>Initiate</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
};
