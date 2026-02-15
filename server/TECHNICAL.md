# Blackout Chat - Server Technical Documentation

## Overview

The server is a Node.js Express application with Socket.IO for real-time communication. It uses PostgreSQL for data persistence with Drizzle ORM for type-safe database operations.

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Express | 5.2.1 | Web framework |
| Socket.IO | 4.8.3 | WebSocket server |
| PostgreSQL | - | Database |
| Drizzle ORM | 0.33.0 | Database toolkit |
| Node.js | - | Runtime |
| bcryptjs | 2.4.3 | Password hashing |
| jsonwebtoken | 9.0.2 | JWT authentication |
| multer | 2.0.2 | File uploads |
| uuid | 13.0.0 | Unique IDs |
| cors | 2.8.5 | CORS middleware |
| dotenv | 16.4.5 | Environment config |

## Project Structure

```
server/
├── db/
│   ├── index.js          # Database connection
│   ├── schema.js         # Drizzle schema definitions
│   ├── init.js           # DB initialization script
│   ├── migrations/       # Database migrations
│   │   └── 0000_pretty_mulholland_black.sql
│   └── schema.js
├── middleware/
│   └── auth.js           # JWT verification
├── routes/
│   ├── auth.js           # Authentication endpoints
│   └── upload.js         # File upload handling
├── uploads/              # Uploaded files
│   ├── images/
│   └── audio/
├── server.js             # Main server entry
├── package.json
├── drizzle.config.js
├── Dockerfile
└── .env                 # Environment variables
```

## Database Schema

### Users Table

```javascript
{
  id: uuid (PK, auto-generated),
  username: varchar(50) UNIQUE NOT NULL,
  displayName: varchar(100) NOT NULL,
  password: varchar(255) NOT NULL (hashed),
  avatarUrl: text,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### Chats Table

```javascript
{
  id: uuid (PK, auto-generated),
  name: varchar(100) NOT NULL,
  description: text,
  imageUrl: text,
  lastMessageAt: timestamp,
  createdAt: timestamp,
  isPrivate: boolean DEFAULT false,
  isDm: boolean DEFAULT false
}
```

### Chat Members Table

```javascript
{
  id: uuid (PK, auto-generated),
  chatId: uuid (FK -> chats.id, cascade delete),
  userId: uuid (FK -> users.id, cascade delete),
  role: varchar(20) DEFAULT 'member', // 'admin' or 'member'
  joinedAt: timestamp
}
```

### Messages Table

```javascript
{
  id: uuid (PK, auto-generated),
  chatId: uuid (FK -> chats.id, cascade delete),
  userId: uuid (FK -> users.id, cascade delete),
  username: varchar(100) NOT NULL,
  messageType: enum ['text','image','audio','video','file','sticker'] DEFAULT 'text',
  content: text,
  mediaUrl: text,
  mediaType: varchar(100),
  mediaDuration: integer (seconds),
  mediaThumbnail: text,
  fileName: varchar(255),
  fileSize: integer (bytes),
  isDeleted: boolean DEFAULT false,
  replyToId: uuid (FK -> messages.id),
  reactions: jsonb DEFAULT {},
  isForwarded: boolean DEFAULT false,
  forwardedFrom: varchar(100),
  stickerId: text,
  updatedAt: timestamp,
  createdAt: timestamp
}
```

## Authentication

### JWT Structure

Tokens are generated with:
```javascript
jwt.sign(
  { userId, username, displayName },
  process.env.JWT_SECRET || 'your-secret-key',
  { expiresIn: '7d' }
)
```

### Middleware

**HTTP (`middleware/auth.js`):**
- `verifyToken` - Validates Bearer token from Authorization header

**Socket.IO:**
- `verifySocket` - Validates token from socket handshake auth

## REST API Endpoints

### Authentication Routes (`/api/auth`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/register` | No | Register new user |
| POST | `/login` | No | Login, returns JWT |
| GET | `/me` | Yes | Get current user |
| PUT | `/profile` | Yes | Update user profile |
| PUT | `/username` | Yes | Update username |
| GET | `/users` | Yes | List all users (avatar caching) |
| GET | `/user/:username` | Yes | Get user by username |

### Upload Routes (`/api/upload`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/image` | Yes | Upload image |
| POST | `/video` | Yes | Upload video |
| POST | `/audio` | Yes | Upload audio file |
| POST | `/voice` | Yes | Upload voice message |

### Other Routes

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/messages` | Yes | Get messages (50 recent) |
| GET | `/api/messages?chatId=` | Yes | Get messages for chat |
| GET | `/api/chats` | Yes | Get user's chat rooms (members + public) |
| POST | `/api/chats/dm` | Yes | Find or create DM chat |
| DELETE | `/api/chats/:chatId` | Yes | Delete chat (admin only) |
| GET | `/api/chats/:chatId/members` | Yes | Get chat members |
| POST | `/api/chats/:chatId/members` | Yes | Add member to chat |
| DELETE | `/api/chats/:chatId/members/:userId` | Yes | Remove member from chat |

## Socket.IO Events

### Incoming Events (Client → Server)

| Event | Data | Description |
|-------|------|-------------|
| `joinChat` | `{ chatId }` | Join a chat room (auto-adds to public chats) |
| `message` | `{ text, messageType, mediaUrl, ... }` | Send message |
| `editMessage` | `{ id, text }` | Edit message |
| `deleteMessage` | `{ id }` | Delete message |
| `toggleReaction` | `{ messageId, emoji, username }` | React to message |
| `createChat` | `{ name, description, imageUrl }` | Create chat room |
| `updateChat` | `{ id, name, description, imageUrl }` | Update chat |

### Outgoing Events (Server → Client)

| Event | Data | Description |
|-------|------|-------------|
| `message` | Message object | New/edited message |
| `messageUpdated` | `{ id, text, updatedAt }` | Message edited |
| `messageDeleted` | `{ id }` | Message deleted |
| `reactionUpdated` | `{ messageId, reactions }` | Reactions changed |
| `chatCreated` | Chat object | New chat room |
| `chatUpdated` | Chat object | Chat updated |
| `chatDeleted` | `{ chatId }` | Chat deleted |

## Message Handling Flow

1. Client sends message via `socket.emit('message', data)`
2. Server validates auth (userId from socket)
3. Server extracts content and media data
4. Server inserts into `messages` table with Drizzle
5. Server updates chat's `lastMessageAt` timestamp
6. Server broadcasts to room via `io.to(chatId).emit('message', ...)`

## File Uploads

- Handled by Multer middleware
- Files stored in `server/uploads/`
- Categories: `images/`, `audio/`, `video/`
- Static serve: `/uploads` route
- All upload routes require authentication via `verifyToken` middleware

## Server Configuration

### Port
- Default: `3000`
- Listens on: `0.0.0.0` (all interfaces)

### Database Connection
- Retry logic: 10 attempts with 5s delay
- Validates connection on startup
- Creates default "Global" chat if none exists

### CORS
- Enabled for all origins: `origin: "*"`

## Environment Variables

```
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=chat_app
JWT_SECRET=your-secret-key
PORT=3000
```

## Database Scripts

```bash
npm run db:generate   # Generate migrations
npm run db:migrate     # Run migrations
npm run db:push        # Push schema to database
npm run db:studio      # Open Drizzle Studio
npm run db:init       # Initialize database
```

## Graceful Shutdown

- Listens for `SIGINT` and `SIGTERM`
- Closes all database connections via `pool.end()`
- Clean process exit

## Key Implementation Details

### Online Users Tracking
```javascript
const onlineUsers = new Map();
// userId -> socket.id
```

### Room Management
- Users join specific chat rooms via `socket.join(chatId)`
- Leave all other rooms when joining new one
- Messages broadcast to specific room or globally

### Message Validation
- Text messages require content
- Media messages require mediaUrl
- Invalid messages logged and skipped

### Soft Delete
- Messages not hard-deleted
- `isDeleted` flag set to true
- Content cleared for privacy
- Media references removed

### Reactions
- Stored as JSONB: `{ "😊": ["user1", "user2"], "👍": ["user3"] }`
- Toggle behavior: add/remove user from emoji list

### Chat Membership
- Users can only see chats they are members of, plus public chats
- Private chats are only visible to members
- Direct messages (DMs) are created between two users
- DM name is sorted usernames (e.g., "alice & bob")
- Both users are admins in DMs
- Chat deletion restricted to admins (Global chat cannot be deleted)
