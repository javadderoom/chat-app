import React, { useState } from 'react';
import { useChatConnection } from './hooks/useChatConnection';
import { ChatList } from './components/ChatList';
import { ChatView } from './components/ChatView';
import { SettingsPanel } from './components/SettingsPanel';
import { ServerHelpModal } from './components/ServerHelpModal';
import LoginPage from './components/LoginPage';
import { useAuth } from './contexts/AuthContext';
import { UserSettings } from './types';
import './index.css';

const DEFAULT_SETTINGS: UserSettings = {
  username: `User-${Math.floor(Math.random() * 1000)}`,
  serverUrl:
    import.meta.env.VITE_SERVER_URL ||
    (window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin),
  isDemoMode: false,
};

const App: React.FC = () => {
  const { user, token, logout, isLoading: authLoading } = useAuth();
  
  const [settings, setSettings] = useState<UserSettings>(() => {
    const saved = localStorage.getItem('blackout_settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  const [showServerHelp, setShowServerHelp] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Update settings username when user changes
  React.useEffect(() => {
    if (user) {
      setSettings(prev => ({ ...prev, username: user.username }));
    }
  }, [user]);

  const {
    messages, chats, activeChatId, setActiveChatId, status, fetchChats,
    sendMessage, sendMediaMessage, editMessage, deleteMessage, createChat, toggleReaction, forwardMessage, sendSticker, updateChat, deleteChat, pinMessage, unpinMessage, startTyping, stopTyping, users, typingUsers,
    unreadCounts, firstUnreadMessageId,
    hasMoreMessages, isLoadingOlderMessages, loadOlderMessages,
    callStatus, callMode, incomingCall, localStream, remoteParticipants, callPeerName, callError,
    startVoiceCall, startVideoCall, acceptCall, declineCall, endCall
  } = useChatConnection(settings, token, user);

  const handleSaveSettings = (newSettings: UserSettings) => {
    const sanitizedSettings = {
      ...newSettings,
      username: newSettings.username.trim()
    };
    setSettings(sanitizedSettings);
    localStorage.setItem('blackout_settings', JSON.stringify(sanitizedSettings));
  };

  const activeChat = chats.find(c => c.id === activeChatId);

  // Show loading spinner while checking authentication
if (authLoading) {
  return (
    <div className="loading-container">
      <div className="text-center">
        <div className="loading-spinner"></div>
        <p className="loading-text">Loading...</p>
      </div>
    </div>
  );
}

// Show login page if not authenticated
if (!user || !token) {
  return <LoginPage />;
}

return (
    <div className={`app_container ${showSidebar ? 'sidebar_open' : ''}`}>
      <ChatList
        chats={chats}
        activeChatId={activeChatId}
        setActiveChatId={setActiveChatId}
        status={status}
        createChat={createChat}
        setShowSidebar={setShowSidebar}
        onOpenSettings={() => setIsSettingsOpen(true)}
        user={user}
        onLogout={logout}
        unreadCounts={unreadCounts}
      />

      <ChatView
        activeChat={activeChat}
        messages={messages}
        status={status}
        settings={settings}
        sendMessage={sendMessage}
        sendMediaMessage={sendMediaMessage}
        editMessage={editMessage}
        deleteMessage={deleteMessage}
        setShowSidebar={setShowSidebar}
        showSidebar={showSidebar}
        setShowServerHelp={setShowServerHelp}
        toggleReaction={toggleReaction}
        forwardMessage={forwardMessage}
        sendSticker={sendSticker}
        startTyping={startTyping}
        stopTyping={stopTyping}
        updateChat={updateChat}
        deleteChat={deleteChat}
        pinMessage={pinMessage}
        unpinMessage={unpinMessage}
        setActiveChatId={setActiveChatId}
        fetchChats={fetchChats}
        chats={chats}
        user={user}
        token={token}
        users={users}
        typingUsers={typingUsers}
        firstUnreadMessageId={firstUnreadMessageId}
        hasMoreMessages={hasMoreMessages}
        isLoadingOlderMessages={isLoadingOlderMessages}
        loadOlderMessages={loadOlderMessages}
        callStatus={callStatus}
        callMode={callMode}
        incomingCall={incomingCall}
        localStream={localStream}
        remoteParticipants={remoteParticipants}
        callPeerName={callPeerName}
        callError={callError}
        startVoiceCall={startVoiceCall}
        startVideoCall={startVideoCall}
        acceptCall={acceptCall}
        declineCall={declineCall}
        endCall={endCall}
      />

      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        token={token}
        serverUrl={settings.serverUrl}
      />

      {showServerHelp && (
        <ServerHelpModal onClose={() => setShowServerHelp(false)} serverUrl={settings.serverUrl} />
      )}
    </div>
  );
};

export default App;
