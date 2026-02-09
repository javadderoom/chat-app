export interface Message {
  id: string;
  text: string;
  sender: string;
  timestamp: number;
  isSystem?: boolean;
  isMe?: boolean;
  // Multimedia fields
  messageType?: 'text' | 'image' | 'audio' | 'video' | 'file';
  mediaUrl?: string;
  mediaType?: string;
  mediaDuration?: number;
  fileName?: string;
  fileSize?: number;
  // Edit/Delete fields
  updatedAt?: string | number;
  isDeleted?: boolean;
}

export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error'
}

export interface UserSettings {
  username: string;
  serverUrl: string;
  isDemoMode: boolean;
}