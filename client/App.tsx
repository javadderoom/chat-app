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
  serverUrl: 'https://deroom-backend.liara.run',
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
    <div className="root_container flex flex-col h-screen bg-[#0d1117] overflow-hidden text-[#c9d1d9] font-mono selection:bg-[#238636] selection:text-white">

      {/* Header */}
      <header className="header flex items-center justify-between px-4 py-3 bg-[#161b22] border-b border-[#30363d] shadow-sm z-10">
        <div className=" logo_block flex items-center gap-3">
          <div className="logo p-2 bg-[#21262d] rounded border border-[#30363d]">
            <Terminal size={20} className="text-green-500" />
          </div>
          <div>
            <h1 className="logo_text font-bold text-white tracking-tight leading-none">BLACKOUT CHAT</h1>
            <div className="status_in_logo flex items-center gap-2 text-[10px] uppercase font-bold tracking-wider mt-1">
              <span className={`badge w-2 h-2 rounded-full ${status === ConnectionStatus.CONNECTED || settings.isDemoMode ? 'badge_green bg-green-500 animate-pulse' : 'badge_red bg-red-500'}`}></span>
              <span className={getStatusColor()}>{getStatusText()}</span>
            </div>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-4 text-xs text-[#8b949e]">
          <div className="flex items-center gap-1">
            <Activity size={14} />
            <span>{settings.username}</span>
          </div>
          <div className="px-2 py-1 bg-[#21262d] rounded border border-[#30363d]">
            v1.0.4-alpha
          </div>
        </div>
      </header>

      {/* Main Chat Area */}
      <main className="flex-1 overflow-y-auto relative p-4 flex flex-col gap-4 scroll-smooth">
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
              <div key={msg.id} className="status_message flex justify-center my-2">
                <span className="text-[10px] uppercase tracking-wider text-[#8b949e] bg-[#161b22] px-3 py-1 rounded-full border border-[#30363d]">
                  {msg.text}
                </span>
              </div>
            );
          }

          return (
            <div
              key={msg.id}
              className={`message flex flex-col max-w-[85%] sm:max-w-[70%] ${msg.isMe ? 'me self-end items-end' : 'them self-start items-start'}`}
            >
              <div className={`info flex items-baseline gap-2 mb-1 px-1 ${msg.isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                <span className={`username text-xs font-bold ${msg.isMe ? 'text-green-400' : 'text-blue-400'}`}>
                  {msg.sender}
                </span>
                <span className="time">
                  {format(msg.timestamp, 'HH:mm:ss')}
                </span>
              </div>

              <div
                className={`text px-4 py-3 rounded-lg text-sm leading-relaxed shadow-sm break-words border ${msg.isMe
                  ? 'me bg-[#238636]/10 border-[#238636]/30 text-white rounded-tr-none'
                  : 'them bg-[#21262d] border-[#30363d] text-[#c9d1d9] rounded-tl-none'
                  }`}
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
        <div className="upload_error fixed bottom-24 left-1/2 -translate-x-1/2 bg-red-500/90 text-white px-4 py-2 rounded-lg text-sm z-50 animate-pulse">
          {uploadError}
          <button onClick={() => setUploadError(null)} className="ml-2 font-bold">×</button>
        </div>
      )}

      {/* Input Area */}
      <footer className="bg-[#161b22] border-t border-[#30363d] p-3 sm:p-4 z-20">
        <form onSubmit={handleSend} className="relative max-w-4xl mx-auto flex items-center gap-2">
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

          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={status === ConnectionStatus.CONNECTED || settings.isDemoMode ? "Enter transmission..." : "Connection lost..."}
              disabled={status !== ConnectionStatus.CONNECTED && !settings.isDemoMode}
              className="message_input w-full bg-[#0d1117] border border-[#30363d] text-white rounded-lg pl-4 pr-10 py-3 focus:outline-none focus:ring-1 focus:ring-[#238636] focus:border-[#238636] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          <button
            type="submit"
            disabled={(!input.trim() || status !== ConnectionStatus.CONNECTED) && !settings.isDemoMode}
            className="p-3 bg-[#238636] text-white rounded-lg hover:bg-[#2ea043] disabled:bg-[#21262d] disabled:text-[#8b949e] transition-colors shadow-lg shadow-green-900/20"
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