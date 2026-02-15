# Blackout Chat - Client Technical Documentation

## Overview

The client is a React 19 application built with TypeScript, Vite, and TailwindCSS. It communicates with the server via Socket.IO for real-time messaging and REST APIs for authentication and data fetching.

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.2.3 | UI Framework |
| TypeScript | ~5.8.2 | Type safety |
| Vite | 6.2.0 | Build tool & dev server |
| TailwindCSS | 4.1.18 | Styling |
| Socket.IO Client | 4.8.3 | Real-time communication |
| Axios | 1.13.4 | HTTP requests |
| Lucide React | 0.562.0 | Icons |
| date-fns | 4.1.0 | Date formatting |
| Lottie React | 2.4.1 | Animations |
| Pako | 2.1.0 | Compression |

## Project Structure

```
client/
├── components/           # React components
│   ├── ChatList.tsx      # Chat room list sidebar
│   ├── ChatView.tsx      # Main message view
│   ├── MessageBubble.tsx # Message bubble component
│   ├── LoginPage.tsx      # Authentication page
│   ├── SettingsPanel.tsx  # User settings modal
│   ├── ServerHelpModal.tsx
│   ├── StickerPicker.tsx  # Sticker selection
│   ├── VoiceMessagePlayer.tsx
│   ├── ForwardModal.tsx
│   ├── ConfirmModal.tsx
│   ├── FileUploadButton.tsx
│   └── ChatSettingsModal.tsx
├── contexts/
│   └── AuthContext.tsx    # Authentication state
├── hooks/
│   ├── chat/
│   │   ├── useChatConnection.ts   # Main connection hook
│   │   ├── useSocketEvents.ts    # Socket event handlers
│   │   ├── useChatActions.ts     # Message actions
│   │   ├── constants.ts
│   │   └── types.ts
│   ├── useChatConnection.ts      # Re-export
│   └── useVoiceRecorder.ts       # Voice recording
├── data/
│   └── stickers.ts       # Sticker assets
├── App.tsx              # Root component
├── index.tsx            # Entry point
├── index.css            # Global styles
├── types.ts             # TypeScript definitions
├── vite.config.ts       # Vite configuration
└── tailwind.config.js   # Tailwind configuration
```

## Architecture

### State Management

The app uses React Context for auth state and custom hooks for chat state:

1. **AuthContext** (`contexts/AuthContext.tsx`)
   - Manages user authentication state
   - Provides `login()`, `logout()`, `user`, `token`
   - Persists auth in localStorage

2. **useChatConnection** (`hooks/chat/useChatConnection.ts`)
   - Main hook managing Socket.IO connection
   - Handles message state, chat list, connection status
   - Implements reconnection logic with exponential backoff
   - Fetches and caches user data (avatars, display names) on connect
   - Returns `users` object for avatar lookup across components

### Data Flow

```
User Action → useChatActions → Socket emit → Server
                                    ↓
                              Socket events
                                    ↓
                          useSocketEvents → Update State
```

### Connection Flow

1. User logs in → Token stored in context
2. `useChatConnection` initializes Socket.IO with token in auth
3. On connection: fetches chat list via REST API
4. On chat selection: joins room via `socket.emit('joinChat')` and fetches history

## Key Components

### App.tsx

Root component managing:
- Settings state (persisted to localStorage)
- Sidebar visibility
- Settings panel modal
- Server help modal
- Conditionally renders LoginPage or ChatList/ChatView

### ChatList.tsx

Sidebar displaying:
- Available chat rooms
- Active chat indicator
- Online status
- Create chat functionality

### ChatView.tsx

Main chat interface with:
- Message list (virtualized for performance)
- Message input with attachments
- Reply/forward modals
- Message editing
- Reactions
- Voice recording

### useSocketEvents.ts

Handles incoming Socket.IO events:
- `message` - New messages
- `messageUpdated` - Edited messages
- `messageDeleted` - Deleted messages
- `reactionUpdated` - Message reactions
- `chatCreated` - New chat room
- `chatUpdated` - Chat info changed

### useChatActions.ts

Provides action methods:
- `sendMessage()` - Send text message
- `sendMediaMessage()` - Send file/image/audio
- `editMessage()` - Edit message
- `deleteMessage()` - Delete message
- `toggleReaction()` - React to message
- `createChat()` - Create new chat
- `forwardMessage()` - Forward message
- `sendSticker()` - Send sticker
- `updateChat()` - Update chat info

## Type Definitions

### Message (types.ts)

```typescript
interface Message {
  id: string;
  text: string;
  sender: string;
  displayName?: string;
  timestamp: number;
  isSystem?: boolean;
  isMe?: boolean;
  messageType?: 'text' | 'image' | 'audio' | 'video' | 'file' | 'sticker';
  mediaUrl?: string;
  mediaType?: string;
  mediaDuration?: number;
  fileName?: string;
  fileSize?: number;
  stickerId?: string;
  updatedAt?: string | number;
  isDeleted?: boolean;
  replyToId?: string;
  chatId?: string;
  reactions?: Record<string, string[]>;
  isForwarded?: boolean;
  forwardedFrom?: string;
}
```

### Chat

```typescript
interface Chat {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  lastMessageAt?: string | number;
  createdAt: string | number;
}
```

### UserSettings

```typescript
interface UserSettings {
  username: string;
  serverUrl: string;
  isDemoMode: boolean;
}
```

### UserInfo

```typescript
interface UserInfo {
  avatarUrl?: string;
  displayName: string;
}
```

## Socket.IO Configuration

```typescript
const socket = io(serverUrl, {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  transports: ['polling', 'websocket'],
  forceNew: true,
  auth: { token }
});
```

## REST API Endpoints

| Method | Endpoint | Headers | Description |
|--------|----------|---------|-------------|
| GET | `/api/messages?chatId=` | Bearer token | Get messages |
| GET | `/api/chats` | Bearer token | Get all chats |
| POST | `/api/upload` | Bearer token | Upload file |
| GET | `/api/auth/users` | Bearer token | Get all users (for avatar caching) |

## Authentication

- JWT-based authentication
- Token passed via:
  - HTTP header: `Authorization: Bearer <token>`
  - Socket.IO auth: `{ token: <token> }`
- Login/register via REST API (`/api/auth/*`)
- Demo mode available (simulated messages)

## Build & Development

```bash
# Install dependencies
npm install

# Development server (port 5173)
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

## Styling

TailwindCSS 4 with custom configuration:
- Dark theme with terminal-inspired aesthetic
- Green accent colors (#00ff00, #22c55e)
- Monospace fonts
- Custom animations for loading states

## LocalStorage Keys

- `blackout_settings` - User preferences
- Auth tokens stored in AuthContext (memory + cookie-like)

## Deployment

Configured for Liara cloud platform:
- `liara.json` - Platform configuration
- `Dockerfile` - Container build
- Build output in `dist/`
