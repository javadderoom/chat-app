// Database message format from API
export interface DbMessage {
    id: string;
    username: string;
    content: string;
    createdAt: string | Date;
    messageType: string;
    mediaUrl?: string;
    mediaType?: string;
    mediaDuration?: number;
    fileName?: string;
    fileSize?: number;
    replyToId?: string;
    chatId?: string;
    reactions?: Record<string, string[]>;
    isForwarded?: boolean;
    forwardedFrom?: string;
    stickerId?: string;
    displayName?: string;
    updatedAt?: string | Date;
}
