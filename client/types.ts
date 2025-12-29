export interface Message {
  id: string;
  text: string;
  sender: string;
  timestamp: number;
  isSystem?: boolean;
  isMe?: boolean;
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