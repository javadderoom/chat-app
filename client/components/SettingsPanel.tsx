
import React, { useState } from 'react';
import { Settings, Save, Server, Monitor, X, Radio } from 'lucide-react';
import { UserSettings } from '../types';
import './SettingsPanel.css';

interface SettingsPanelProps {
  currentSettings: UserSettings;
  onSave: (settings: UserSettings) => void;
  onOpenServerHelp: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ currentSettings, onSave, onOpenServerHelp }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState(currentSettings);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    setIsOpen(false);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="settings-trigger"
        title="Access Configuration"
      >
        <Settings size={20} />
      </button>
    );
  }

  return (
    <div className="settings-overlay">
      <div className="settings-modal">

        {/* Header */}
        <div className="settings-header">
          <div className="settings-title">
            <h2>
              <Settings size={20} />
              <span>System Configuration</span>
            </h2>
            <p className="settings-subtitle">Parameters & connection settings</p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="close-button"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="settings-form">

          {/* Identity Section */}
          <div className="settings-section">
            <div className="settings-section-header">
              <Radio size={14} />
              <span className="settings-section-title">Identity</span>
            </div>

            <div className="input-group">
              <label className="input-label">Callsign</label>
              <div className="relative group">
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="text-input"
                  placeholder="Enter callsign..."
                />
              </div>
            </div>
          </div>

          {/* Connection Section */}
          <div className="settings-section">
            <div className="settings-section-header">
              <Server size={14} />
              <span className="settings-section-title">Connection</span>
            </div>

            <div className="input-group">
              <label className="input-label">Target Frequency (Server URL)</label>
              <div className="relative group">
                <input
                  type="text"
                  value={formData.serverUrl}
                  onChange={(e) => setFormData({ ...formData, serverUrl: e.target.value })}
                  disabled={formData.isDemoMode}
                  className="text-input"
                  placeholder="e.g. http://localhost:3000"
                />
              </div>
              <p className="input-help">
                Use Local IP (e.g., 192.168.1.5:3000) for LAN access.
              </p>
            </div>

            {/* Simulation Mode Toggle */}
            <div className={`toggle-container ${formData.isDemoMode ? 'active' : ''}`}>
              <div className="toggle-info">
                <div className="toggle-icon">
                  <Monitor size={18} />
                </div>
                <div className="toggle-text">
                  <span className="toggle-title">Simulation Mode</span>
                  <span className="toggle-subtitle">Offline demo environment</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, isDemoMode: !formData.isDemoMode })}
                className={`switch-button ${formData.isDemoMode ? 'checked' : ''}`}
              >
                <span className="switch-thumb" />
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="actions">
            <button
              type="submit"
              className="save-button"
            >
              <Save size={18} />
              Save Configuration
            </button>

            <button
              type="button"
              onClick={onOpenServerHelp}
              className="help-button"
            >
              Need help hosting a server?
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};