import React, { useState, useEffect, useRef } from 'react';
import { Send, WifiOff, Terminal, Activity, Mic, Trash2, X, Square, Edit2, Check, MoreVertical } from 'lucide-react';
import { useChatConnection } from './hooks/useChatConnection';
import { useVoiceRecorder } from './hooks/useVoiceRecorder';
import { SettingsPanel } from './components/SettingsPanel';
import { ServerHelpModal } from './components/ServerHelpModal';
import { FileUploadButton, UploadResult } from './components/FileUploadButton';
import { VoiceMessagePlayer } from './components/VoiceMessagePlayer';
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

  const { messages, status, sendMessage, sendMediaMessage, editMessage, deleteMessage } = useChatConnection(settings);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Edit & Menu state
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Save settings when changed
  const handleSaveSettings = (newSettings: UserSettings) => {
    const sanitizedSettings = {
      ...newSettings,
      username: newSettings.username.trim()
    };
    setSettings(sanitizedSettings);
    localStorage.setItem('blackout_settings', JSON.stringify(sanitizedSettings));
  };

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim()) return;

    if (editingMessageId) {
      editMessage(editingMessageId, input);
      setEditingMessageId(null);
    } else {
      sendMessage(input);
    }

    setInput('');
  };

  const handleVoiceUpload = async (file: File) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      // Optional: Add duration if we had it, but server handles it or metadata

      const response = await fetch(`${settings.serverUrl}/api/upload/voice`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const data: UploadResult = await response.json();
      sendMediaMessage(data);
    } catch (error) {
      console.error('Voice upload failed:', error);
      setUploadError('Failed to send voice message');
    }
  };

  const { isRecording, recordingDuration, startRecording, stopRecording, cancelRecording } = useVoiceRecorder({
    onRecordingComplete: handleVoiceUpload,
    onError: (err) => setUploadError(err),
  });

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startEditing = (msg: any) => {
    setEditingMessageId(msg.id);
    setInput(msg.text);
    // Use timeout to ensure input is available if it was disabled
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setInput('');
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this message?')) {
      deleteMessage(id);
    }
    setActiveMenuId(null);
  };

  const handleMessageClick = (msg: any) => {
    if (!msg.isMe || editingMessageId === msg.id) return;
    setActiveMenuId(prev => prev === msg.id ? null : msg.id);
  };

  // Close menu on scroll or click outside
  useEffect(() => {
    const handleEvents = () => setActiveMenuId(null);
    window.addEventListener('scroll', handleEvents, true);
    window.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('.message_actions_popup') &&
        !(e.target as HTMLElement).closest('.text.me')) {
        handleEvents();
      }
    }, true);
    return () => {
      window.removeEventListener('scroll', handleEvents, true);
    };
  }, []);

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
                className={`text ${msg.isMe ? 'me' : 'them'} relative group cursor-pointer`}
                onClick={() => handleMessageClick(msg)}
              >
                {msg.isMe && activeMenuId === msg.id && (
                  <div className="message_actions_popup">
                    <button
                      onClick={(e) => { e.stopPropagation(); startEditing(msg); setActiveMenuId(null); }}
                      className="menu_item"
                    >
                      <Edit2 size={14} />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(msg.id); }}
                      className="menu_item delete"
                    >
                      <Trash2 size={14} />
                      <span>Delete</span>
                    </button>
                  </div>
                )}
                {msg.messageType === 'image' && msg.mediaUrl && (
                  <div className="media_content">
                    <img
                      src={msg.mediaUrl}
                      alt={msg.fileName || 'Image'}
                      className="media_image"
                      onClick={() => window.open(msg.mediaUrl, '_blank')}
                    />
                  </div>
                )}

                {msg.messageType === 'video' && msg.mediaUrl && (
                  <div className="media_content">
                    <video
                      src={msg.mediaUrl}
                      controls
                      className="media_video"
                    />
                  </div>
                )}

                {(msg.messageType === 'audio' || msg.messageType === 'voice') && msg.mediaUrl && (
                  <div className="media_content">
                    <VoiceMessagePlayer
                      src={msg.mediaUrl}
                      duration={msg.mediaDuration}
                    />
                  </div>
                )}

                {!msg.mediaUrl && msg.text && (
                  <div className="message_text_content">
                    {msg.text}
                    {msg.updatedAt && <span className="text-[10px] text-gray-500 ml-2 italic">(edited)</span>}
                  </div>
                )}
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
          <div className={`input_pill ${isRecording ? 'recording_active' : ''} ${editingMessageId ? 'editing_mode' : ''}`}>
            {isRecording ? (
              <div className="recording_container">
                <div className="recording_indicator animate-pulse">
                  <div className="recording_dot"></div>
                  <span className="recording_timer">{formatDuration(recordingDuration)}</span>
                </div>
                <div className="recording_text">Recording...</div>
                <button
                  type="button"
                  onClick={cancelRecording}
                  className="cancel_record_button"
                  title="Cancel"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ) : (
              <>
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
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={editingMessageId ? "Edit message..." : (status === ConnectionStatus.CONNECTED || settings.isDemoMode ? "Message" : "Connecting...")}
                    disabled={status !== ConnectionStatus.CONNECTED && !settings.isDemoMode}
                    className="message_input"
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') cancelEdit();
                    }}
                  />
                  {editingMessageId && (
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-red-500"
                      title="Cancel Edit"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {isRecording ? (
            <button
              type="button"
              className="send_button recording"
              onClick={stopRecording}
            >
              <Square size={16} fill="white" />
            </button>
          ) : (
            input.trim() ? (
              <button
                type="submit"
                className={`send_button ${editingMessageId ? 'editing' : ''}`}
                disabled={status !== ConnectionStatus.CONNECTED && !settings.isDemoMode}
              >
                {editingMessageId ? <Check size={20} /> : <Send size={20} />}
              </button>
            ) : (
              <button
                type="button"
                className="send_button"
                onClick={startRecording}
                disabled={status !== ConnectionStatus.CONNECTED && !settings.isDemoMode}
              >
                <Mic size={20} />
              </button>
            )
          )}
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