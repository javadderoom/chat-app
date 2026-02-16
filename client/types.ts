export interface Message {
  id: string;
  text: string;
  sender: string;
  displayName?: string; // Display name from user profile
  timestamp: number;
  isSystem?: boolean;
  isMe?: boolean;
  // Multimedia fields
  messageType?: 'text' | 'image' | 'audio' | 'video' | 'file' | 'sticker';
  mediaUrl?: string;
  mediaType?: string;
  mediaDuration?: number;
  fileName?: string;
  fileSize?: number;
  stickerId?: string;
  // Edit/Delete fields
  updatedAt?: string | number;
  isDeleted?: boolean;
  replyToId?: string;
  chatId?: string;
  reactions?: Record<string, string[]>; // emoji -> list of usernames
  isForwarded?: boolean;
  forwardedFrom?: string; // username of the original sender
  deliveredCount?: number;
  seenCount?: number;
  seenBy?: string[];
}

export interface PinnedMessageSummary {
  id: string;
  chatId?: string;
  userId?: string;
  sender: string;
  displayName?: string;
  text: string;
  messageType?: Message['messageType'];
  mediaUrl?: string;
  stickerId?: string;
  timestamp: string | number;
}

export interface Chat {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  lastMessageAt?: string | number;
  createdAt: string | number;
  isPrivate?: boolean;
  isDm?: boolean;
  pinnedMessageId?: string | null;
  pinnedByUserId?: string | null;
  pinnedAt?: string | number | null;
  pinnedMessage?: PinnedMessageSummary | null;
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

export interface UserInfo {
  avatarUrl?: string;
  displayName: string;
}
