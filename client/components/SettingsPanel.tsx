import React, { useState } from 'react';
import { Settings, Save, Server, Monitor } from 'lucide-react';
import { UserSettings } from '../types';

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
        className="fixed bottom-4 left-4 z-40 p-3 bg-[#21262d] border border-[#30363d] rounded-full shadow-lg text-[#c9d1d9] hover:bg-[#30363d] hover:text-white transition-all hover:scale-105"
        title="Settings"
      >
        <Settings size={20} />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:p-4">
      <div className="bg-[#161b22] border border-[#30363d] w-full sm:w-96 rounded-t-xl sm:rounded-xl shadow-2xl p-6 animate-in slide-in-from-bottom-10 fade-in duration-200">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Settings size={20} />
            Configuration
          </h2>
          <button 
            onClick={() => setIsOpen(false)}
            className="text-sm text-[#8b949e] hover:text-white"
          >
            Cancel
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#8b949e] uppercase mb-1">Callsign (Username)</label>
            <input 
              type="text" 
              value={formData.username}
              onChange={(e) => setFormData({...formData, username: e.target.value})}
              className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-white focus:outline-none focus:border-[#238636] focus:ring-1 focus:ring-[#238636] transition-all font-mono"
              placeholder="e.g. Maverick"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#8b949e] uppercase mb-1">Target Frequency (Server URL)</label>
            <input 
              type="text" 
              value={formData.serverUrl}
              onChange={(e) => setFormData({...formData, serverUrl: e.target.value})}
              disabled={formData.isDemoMode}
              className="w-full bg-[#0d1117] border border-[#30363d] disabled:opacity-50 rounded px-3 py-2 text-white focus:outline-none focus:border-[#238636] focus:ring-1 focus:ring-[#238636] transition-all font-mono"
              placeholder="e.g. http://203.0.113.10:3000"
            />
            <p className="text-[10px] text-[#8b949e] mt-1">
               Use Local IP (192.168.x.x) for WiFi or External IP for WAN.
            </p>
          </div>

          <div className="flex items-center justify-between p-3 border border-[#30363d] rounded bg-[#0d1117]">
            <div className="flex items-center gap-2">
              <Monitor size={16} className={formData.isDemoMode ? "text-green-400" : "text-[#8b949e]"} />
              <div className="flex flex-col">
                <span className="text-sm font-medium text-white">Simulation Mode</span>
                <span className="text-[10px] text-[#8b949e]">Offline demo without server</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFormData({...formData, isDemoMode: !formData.isDemoMode})}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${formData.isDemoMode ? 'bg-[#238636]' : 'bg-[#30363d]'}`}
            >
              <span 
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.isDemoMode ? 'translate-x-6' : 'translate-x-1'}`} 
              />
            </button>
          </div>

          <button 
            type="button"
            onClick={onOpenServerHelp}
            className="w-full flex items-center justify-center gap-2 py-2 text-sm text-[#8b949e] hover:text-white border border-dashed border-[#30363d] rounded hover:border-[#8b949e] transition-all"
          >
            <Server size={14} />
            How to host a local server?
          </button>

          <button 
            type="submit"
            className="w-full bg-[#238636] hover:bg-[#2ea043] text-white font-bold py-2 px-4 rounded transition-colors flex items-center justify-center gap-2"
          >
            <Save size={16} />
            Apply Changes
          </button>
        </form>
      </div>
    </div>
  );
};