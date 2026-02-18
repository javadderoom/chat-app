import React from 'react';
import { AtSign, Bell, CornerDownLeft, Phone, X } from 'lucide-react';
import { InAppNotification } from '../hooks/chat/useChatConnection';
import './InAppNotifications.css';

interface InAppNotificationsProps {
    notifications: InAppNotification[];
    onDismiss: (notificationId: string) => void;
    onOpenChat: (chatId: string) => void;
}

export const InAppNotifications: React.FC<InAppNotificationsProps> = ({
    notifications,
    onDismiss,
    onOpenChat
}) => {
    if (notifications.length === 0) return null;

    return (
        <div className="in_app_notifications" role="status" aria-live="polite">
            {notifications.map((notification) => (
                <div
                    key={notification.id}
                    className="in_app_notification_toast"
                    onClick={() => {
                        if (!notification.chatId) return;
                        onOpenChat(notification.chatId);
                        onDismiss(notification.id);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                        if ((event.key === 'Enter' || event.key === ' ') && notification.chatId) {
                            event.preventDefault();
                            onOpenChat(notification.chatId);
                            onDismiss(notification.id);
                        }
                    }}
                    title={notification.chatId ? 'Open chat' : undefined}
                >
                    <div className="in_app_notification_icon">
                        {notification.type === 'call'
                            ? <Phone size={14} />
                            : notification.type === 'ping'
                                ? <AtSign size={14} />
                                : notification.type === 'reply'
                                    ? <CornerDownLeft size={14} />
                                : <Bell size={14} />}
                    </div>
                    <div className="in_app_notification_content">
                        <h4>{notification.title}</h4>
                        <p>{notification.body}</p>
                    </div>
                    <button
                        type="button"
                        className="in_app_notification_close"
                        onClick={(event) => {
                            event.stopPropagation();
                            onDismiss(notification.id);
                        }}
                        title="Dismiss notification"
                    >
                        <X size={14} />
                    </button>
                </div>
            ))}
        </div>
    );
};
