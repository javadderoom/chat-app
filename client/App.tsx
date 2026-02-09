import React, { useState, useEffect, useRef } from 'react';
import { Send, WifiOff, Terminal, Activity } from 'lucide-react';
import { useChatConnection } from './hooks/useChatConnection';
import { SettingsPanel } from './components/SettingsPanel';
import { ServerHelpModal } from './components/ServerHelpModal';
import { FileUploadButton, UploadResult } from './components/FileUploadButton';
import { UserSettings, ConnectionStatus } from './types';
import { format } from 'date-fns';

const DEFAULT_SETTINGS: UserSettings = {
  username: `User-${Math.floor(Math.random() * 1000)}`,
  serverUrl: 'http://localhost:3000',
  isDemoMode: false,
};

const App: React.FC = () => {
  // Load settings from local storage if available
  const [settings, setSettings] = useState<UserSettings>(() => {
    const saved = localStorage.getItem('blackout_settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  const [input, setInput] = useState('');
  const [showServerHelp, setShowServerHelp] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, status, sendMessage, sendMediaMessage } = useChatConnection(settings);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Save settings when changed
  const handleSaveSettings = (newSettings: UserSettings) => {
    setSettings(newSettings);
    localStorage.setItem('blackout_settings', JSON.stringify(newSettings));
  };

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim()) return;
    sendMessage(input);
    setInput('');
  };

  // Status indicator helpers
  const getStatusColor = () => {
    switch (status) {
      case ConnectionStatus.CONNECTED: return 'text-green-500';
      case ConnectionStatus.CONNECTING: return 'text-yellow-500';
      case ConnectionStatus.ERROR: return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const getStatusText = () => {
    if (settings.isDemoMode) return 'SIMULATION';
    switch (status) {
      case ConnectionStatus.CONNECTED: return 'ONLINE (LAN)';
      case ConnectionStatus.CONNECTING: return 'SEARCHING...';
      case ConnectionStatus.ERROR: return 'CONNECTION FAILED';
      default: return 'OFFLINE';
    }
  };

  return (
    <div className="root_container">

      {/* Header */}
      <header className="header">
        <div className="logo_block">
          <div className="logo p-2 bg-[#21262d] rounded border border-[#30363d]">
            <Terminal size={20} className="badge_green_text" />
          </div>
          <div>
            <h1 className="logo_text">BLACKOUT CHAT</h1>
            <div className="status_in_logo">
              <span className={`badge ${status === ConnectionStatus.CONNECTED || settings.isDemoMode ? 'badge_green animate-pulse' : 'badge_red'}`}></span>
              <span className={getStatusColor()}>{getStatusText()}</span>
            </div>
          </div>
        </div>

        <div className="header_stats">
          <div className="stats_item">
            <Activity size={14} />
            <span>{settings.username}</span>
          </div>
          <div className="version_badge">
            v1.0.4-alpha
          </div>
        </div>
      </header>

      {/* Main Chat Area */}
      <main>
        {messages.length === 0 && (
          <div className="signal">
            <WifiOff size={48} className="mb-4" />
            <p>No transmissions detected.</p>
            <p className="text-xs mt-2">Waiting for signal...</p>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.isSystem) {
            return (
              <div key={msg.id} className="status_message">
                <span>
                  {msg.text}
                </span>
              </div>
            );
          }

          return (
            <div
              key={msg.id}
              className={`message ${msg.isMe ? 'me' : 'them'}`}
            >
              <div className={`info ${msg.isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                <span className={`username text-xs font-bold ${msg.isMe ? 'text-green-400' : 'text-blue-400'}`}>
                  {msg.sender}
                </span>
                <span className="time">
                  {format(msg.timestamp, 'HH:mm:ss')}
                </span>
              </div>

              <div
                className={`text ${msg.isMe ? 'me' : 'them'}`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </main>
      {/* Upload Error Toast */}
      {uploadError && (
        <div className="upload_error">
          {uploadError}
          <button onClick={() => setUploadError(null)}>×</button>
        </div>
      )}

      {/* Input Area */}
      <footer>
        <form onSubmit={handleSend} className="footer_form">
          <div className="input_pill">
            {/* File Upload Button */}
            <FileUploadButton
              serverUrl={settings.serverUrl}
              disabled={status !== ConnectionStatus.CONNECTED && !settings.isDemoMode}
              onUploadComplete={(data: UploadResult) => {
                setUploadError(null);
                sendMediaMessage(data);
              }}
              onError={(error: string) => {
                setUploadError(error);
                setTimeout(() => setUploadError(null), 5000);
              }}
            />

            <div className="input_wrapper">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={status === ConnectionStatus.CONNECTED || settings.isDemoMode ? "Message" : "Connecting..."}
                disabled={status !== ConnectionStatus.CONNECTED && !settings.isDemoMode}
                className="message_input"
              />
            </div>
          </div>

          <button
            type="submit"
            className="send_button"
            disabled={(!input.trim() || status !== ConnectionStatus.CONNECTED) && !settings.isDemoMode}
          >
            <Send size={20} />
          </button>
        </form>
      </footer>

      {/* Modals */}
      <SettingsPanel
        currentSettings={settings}
        onSave={handleSaveSettings}
        onOpenServerHelp={() => setShowServerHelp(true)}
      />
      <ServerHelpModal
        isOpen={showServerHelp}
        onClose={() => setShowServerHelp(false)}
      />
    </div>
  );
};

export default App;