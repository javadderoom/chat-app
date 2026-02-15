import React, { useState, useEffect } from 'react';
import { Users, X } from 'lucide-react';
import './ChatMembersPanel.css';

interface ChatMember {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    role: string;
    joinedAt: string;
}

interface ChatMembersPanelProps {
    chatId: string;
    serverUrl: string;
    token: string;
    onClose: () => void;
}

export const ChatMembersPanel: React.FC<ChatMembersPanelProps> = ({
    chatId,
    serverUrl,
    token,
    onClose,
}) => {
    const [members, setMembers] = useState<ChatMember[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchMembers();
    }, [chatId, token, serverUrl]);

    const fetchMembers = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`${serverUrl}/api/chats/${chatId}/members`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setMembers(data);
            }
        } catch (err) {
            console.error('Error fetching members:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const getInitials = (name: string) => {
        return name.charAt(0).toUpperCase();
    };

    return (
        <div className="members_panel">
            <div className="members_panel_header">
                <Users size={18} />
                <h3>Members ({members.length})</h3>
                <button onClick={onClose} className="members_panel_close">
                    <X size={18} />
                </button>
            </div>
            
            <div className="members_panel_content">
                {isLoading ? (
                    <div className="members_panel_loading">Loading...</div>
                ) : (
                    <ul className="members_panel_list">
                        {members.map(member => (
                            <li key={member.id} className="members_panel_item">
                                <div className="members_panel_avatar">
                                    {member.avatarUrl ? (
                                        <img src={member.avatarUrl} alt="" />
                                    ) : (
                                        getInitials(member.displayName || member.username)
                                    )}
                                </div>
                                <div className="members_panel_info">
                                    <span className="members_panel_name">
                                        {member.displayName || member.username}
                                    </span>
                                    <span className="members_panel_username">
                                        @{member.username}
                                    </span>
                                </div>
                                {member.role === 'admin' && (
                                    <span className="members_panel_badge">admin</span>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};
