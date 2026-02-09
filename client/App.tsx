import React, { useState } from 'react';
import { useChatConnection } from './hooks/useChatConnection';
import { ChatList } from './components/ChatList';
import { ChatView } from './components/ChatView';
import { SettingsPanel } from './components/SettingsPanel';
import { ServerHelpModal } from './components/ServerHelpModal';
import { UserSettings } from './types';
import './index.css';

const DEFAULT_SETTINGS: UserSettings = {
  username: `User-${Math.floor(Math.random() * 1000)}`,
  serverUrl: 'http://localhost:3000',
  isDemoMode: false,
};

const App: React.FC = () => {
  const [settings, setSettings] = useState<UserSettings>(() => {
    const saved = localStorage.getItem('blackout_settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  const [showServerHelp, setShowServerHelp] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);

  const {
    messages, chats, activeChatId, setActiveChatId, status,
    sendMessage, sendMediaMessage, editMessage, deleteMessage, createChat
  } = useChatConnection(settings);

  const handleSaveSettings = (newSettings: UserSettings) => {
    const sanitizedSettings = {
      ...newSettings,
      username: newSettings.username.trim()
    };
    setSettings(sanitizedSettings);
    localStorage.setItem('blackout_settings', JSON.stringify(sanitizedSettings));
  };

  const activeChat = chats.find(c => c.id === activeChatId);

  return (
    <div className={`app_container ${showSidebar ? 'sidebar_open' : ''}`}>
      <ChatList
        chats={chats}
        activeChatId={activeChatId}
        setActiveChatId={setActiveChatId}
        status={status}
        createChat={createChat}
        setShowSidebar={setShowSidebar}
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
      />

      <SettingsPanel
        currentSettings={settings}
        onSave={handleSaveSettings}
        onOpenServerHelp={() => setShowServerHelp(true)}
      />

      {showServerHelp && (
        <ServerHelpModal onClose={() => setShowServerHelp(false)} serverUrl={settings.serverUrl} />
      )}
    </div>
  );
};

export default App;