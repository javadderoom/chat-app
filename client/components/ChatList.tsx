import React, { useState } from 'react';
import { Terminal, Plus, MessageSquare, X, Settings } from 'lucide-react';
import './ChatList.css';

interface Chat {
    id: string;
    name: string;
    description?: string;
}

interface ChatListProps {
    chats: Chat[];
    activeChatId: string | null;
    setActiveChatId: (id: string) => void;
    status: string;
    createChat: (name: string, description: string) => void;
    setShowSidebar: (show: boolean) => void;
    onOpenSettings: () => void;
}

export const ChatList: React.FC<ChatListProps> = ({
    chats,
    activeChatId,
    setActiveChatId,
    status,
    createChat,
    setShowSidebar,
    onOpenSettings
}) => {
    const [showNewChatModal, setShowNewChatModal] = useState(false);
    const [newChatName, setNewChatName] = useState('');
    const [newChatDesc, setNewChatDesc] = useState('');

    const handleCreateChat = (e: React.FormEvent) => {
        e.preventDefault();
        if (newChatName.trim()) {
            createChat(newChatName.trim(), newChatDesc.trim());
            setNewChatName('');
            setNewChatDesc('');
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
                                <MessageSquare size={16} />
                            </div>
                            <div className="chat_info">
                                <span className="chat_name">{chat.name}</span>
                                {chat.description && <span className="chat_desc">{chat.description}</span>}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="sidebar_footer">
                    <div className="connection_status">
                        <div className={`status_dot ${status.toLowerCase()}`}></div>
                        <span>{status}</span>
                    </div>
                    <button onClick={onOpenSettings} className="footer_settings_button" title="Settings">
                        <Settings size={18} />
                    </button>
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
