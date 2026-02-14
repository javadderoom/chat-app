import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Settings, Save, X, Image as ImageIcon, Upload, User, Lock, AtSign } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './SettingsPanel.css';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  serverUrl: string;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen,
  onClose,
  token,
  serverUrl,
}) => {
  const { user, updateUser } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [username, setUsername] = useState(user?.username || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName);
      setUsername(user.username);
      setAvatarUrl(user.avatarUrl || '');
      setSelectedFile(null);
    }
  }, [user, isOpen]);

  if (!isOpen || !token) return null;

  const getPreviewUrl = () => {
    if (selectedFile) {
      return URL.createObjectURL(selectedFile);
    }
    if (avatarUrl) {
      return avatarUrl;
    }
    return null;
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${serverUrl}/api/upload/image`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        const url = data.mediaUrl || data.url;
        if (url) {
          const fullUrl = url.startsWith('http') ? url : `${serverUrl}${url}`;
          setAvatarUrl(fullUrl);
        }
        setSelectedFile(null);
      } else {
        console.error('Upload failed:', response.status);
        setSelectedFile(null);
      }
    } catch (error) {
      console.error('Upload error:', error);
      setSelectedFile(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!token) return;

    if (newPassword && newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsSaving(true);

    try {
      const profileResponse = await fetch(`${serverUrl}/api/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          displayName,
          avatarUrl: avatarUrl || null,
          password: newPassword || undefined,
        }),
      });

      if (!profileResponse.ok) {
        const err = await profileResponse.json();
        throw new Error(err.error || 'Failed to update profile');
      }

      const updatedProfile = await profileResponse.json();

      if (username !== user?.username) {
        const usernameResponse = await fetch(`${serverUrl}/api/auth/username`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ username }),
        });

        if (!usernameResponse.ok) {
          const err = await usernameResponse.json();
          throw new Error(err.error || 'Failed to update username');
        }
      }

      if (user) {
        updateUser({
          ...user,
          username: username || user.username,
          displayName: updatedProfile.displayName,
          avatarUrl: updatedProfile.avatarUrl,
        });
      }

      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Profile updated successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal profile-modal" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <div className="settings-title">
            <h2>
              <Settings size={20} />
              <span>Profile Settings</span>
            </h2>
            <p className="settings-subtitle">Manage your account information</p>
          </div>
          <button onClick={onClose} className="close-button">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSaveProfile} className="settings-form">
          <div className="avatar-upload-section">
            <div className="avatar-preview-large">
              {getPreviewUrl() ? (
                <img src={getPreviewUrl()!} alt="Profile" />
              ) : (
                <div className="avatar-placeholder-large">
                  <User size={40} />
                </div>
              )}
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept="image/*"
              className="hidden"
            />
            <button
              type="button"
              className="upload-avatar-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              <Upload size={16} />
              {isUploading ? 'Uploading...' : 'Change Avatar'}
            </button>
          </div>

          <div className="settings-section">
            <div className="settings-section-header">
              <AtSign size={14} />
              <span className="settings-section-title">Username</span>
            </div>
            <div className="input-group">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="text-input"
                placeholder="Enter username"
              />
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section-header">
              <User size={14} />
              <span className="settings-section-title">Display Name</span>
            </div>
            <div className="input-group">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="text-input"
                placeholder="Enter display name"
              />
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section-header">
              <Lock size={14} />
              <span className="settings-section-title">Change Password</span>
            </div>
            <div className="input-group">
              <label className="input-label">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="text-input"
                placeholder="Leave empty to keep current password"
              />
            </div>
            <div className="input-group" style={{ marginTop: '0.75rem' }}>
              <label className="input-label">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="text-input"
                placeholder="Confirm new password"
              />
            </div>
          </div>

          {error && <div className="profile-error">{error}</div>}
          {success && <div className="profile-success">{success}</div>}

          <div className="actions">
            <button
              type="submit"
              className="save-button"
              disabled={isSaving}
            >
              <Save size={18} />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
