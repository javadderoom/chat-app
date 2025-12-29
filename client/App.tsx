import React, { useState, useEffect, useRef } from 'react';
import { Send, Wifi, WifiOff, Terminal, Activity, Menu, Download } from 'lucide-react';
import { useChatConnection } from './hooks/useChatConnection';
import { SettingsPanel } from './components/SettingsPanel';
import { ServerHelpModal } from './components/ServerHelpModal';
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
  
  const { messages, status, sendMessage } = useChatConnection(settings);

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
    <div className="flex flex-col h-screen bg-[#0d1117] overflow-hidden text-[#c9d1d9] font-mono selection:bg-[#238636] selection:text-white">
      
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-[#161b22] border-b border-[#30363d] shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#21262d] rounded border border-[#30363d]">
            <Terminal size={20} className="text-green-500" />
          </div>
          <div>
            <h1 className="font-bold text-white tracking-tight leading-none">BLACKOUT CHAT</h1>
            <div className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-wider mt-1">
              <span className={`w-2 h-2 rounded-full ${status === ConnectionStatus.CONNECTED || settings.isDemoMode ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
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
           <div className="flex flex-col items-center justify-center h-full text-[#8b949e] opacity-50">
             <WifiOff size={48} className="mb-4" />
             <p>No transmissions detected.</p>
             <p className="text-xs mt-2">Waiting for signal...</p>
           </div>
        )}

        {messages.map((msg) => {
          if (msg.isSystem) {
             return (
               <div key={msg.id} className="flex justify-center my-2">
                 <span className="text-[10px] uppercase tracking-wider text-[#8b949e] bg-[#161b22] px-3 py-1 rounded-full border border-[#30363d]">
                   {msg.text}
                 </span>
               </div>
             );
          }

          return (
            <div 
              key={msg.id} 
              className={`flex flex-col max-w-[85%] sm:max-w-[70%] ${msg.isMe ? 'self-end items-end' : 'self-start items-start'}`}
            >
              <div className={`flex items-baseline gap-2 mb-1 px-1 ${msg.isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                <span className={`text-xs font-bold ${msg.isMe ? 'text-green-400' : 'text-blue-400'}`}>
                  {msg.sender}
                </span>
                <span className="text-[10px] text-[#8b949e]">
                  {format(msg.timestamp, 'HH:mm:ss')}
                </span>
              </div>
              
              <div 
                className={`px-4 py-3 rounded-lg text-sm leading-relaxed shadow-sm break-words border ${
                  msg.isMe 
                    ? 'bg-[#238636]/10 border-[#238636]/30 text-white rounded-tr-none' 
                    : 'bg-[#21262d] border-[#30363d] text-[#c9d1d9] rounded-tl-none'
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </main>

      {/* Input Area */}
      <footer className="bg-[#161b22] border-t border-[#30363d] p-3 sm:p-4 z-20">
        <form onSubmit={handleSend} className="relative max-w-4xl mx-auto flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={status === ConnectionStatus.CONNECTED || settings.isDemoMode ? "Enter transmission..." : "Connection lost..."}
              disabled={status !== ConnectionStatus.CONNECTED && !settings.isDemoMode}
              className="w-full bg-[#0d1117] border border-[#30363d] text-white rounded-lg pl-4 pr-10 py-3 focus:outline-none focus:ring-1 focus:ring-[#238636] focus:border-[#238636] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {status === ConnectionStatus.CONNECTED && !settings.isDemoMode && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            )}
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