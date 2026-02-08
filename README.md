# 💬 Blackout Chat

A real-time chat application with a sleek dark terminal-inspired UI. Built with React, Socket.IO, Express, and PostgreSQL.

![Version](https://img.shields.io/badge/version-1.0.4--alpha-green)
![License](https://img.shields.io/badge/license-ISC-blue)

## ✨ Features

- **Real-time messaging** - Instant message delivery using WebSocket connections
- **Persistent storage** - All messages are saved to PostgreSQL database
- **Terminal-inspired UI** - Dark theme with a hacker aesthetic
- **LAN support** - Connect devices on the same network
- **Demo mode** - Test the interface without a server connection
- **Voice recording** - Record and send voice messages
- **Settings panel** - Customize username and server URL
- **Responsive design** - Works on desktop and mobile devices

## 🛠 Tech Stack

### Frontend (Client)
- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Socket.IO Client** - Real-time communication
- **Lucide React** - Icons
- **date-fns** - Date formatting

### Backend (Server)
- **Express 5** - Web framework
- **Socket.IO** - WebSocket server
- **PostgreSQL** - Database
- **Drizzle ORM** - Database toolkit
- **Node.js** - Runtime environment

## 📁 Project Structure

```
chat-app/
├── client/                 # Frontend application
│   ├── components/         # React components
│   │   ├── SettingsPanel.tsx
│   │   ├── ServerHelpModal.tsx
│   │   └── recording.tsx
│   ├── hooks/              # Custom React hooks
│   │   └── useChatConnection.ts
│   ├── App.tsx             # Main application component
│   ├── index.tsx           # React entry point
│   ├── index.css           # Global styles
│   ├── types.ts            # TypeScript type definitions
│   ├── vite.config.ts      # Vite configuration
│   ├── Dockerfile          # Client Docker config
│   └── package.json
├── server/                 # Backend application
│   ├── db/                 # Database configuration
│   │   ├── index.js        # Database connection
│   │   ├── schema.js       # Drizzle schema
│   │   └── init.js         # DB initialization
│   ├── server.js           # Express & Socket.IO server
│   ├── drizzle.config.js   # Drizzle ORM config
│   ├── Dockerfile          # Server Docker config
│   └── package.json
└── docker-compose.yml      # Docker orchestration
```

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- PostgreSQL (or Docker)
- npm or yarn

### Running with Docker (Recommended)

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd chat-app
   ```

2. **Start all services**
   ```bash
   docker-compose up -d
   ```

3. **Access the application**
   - Frontend: http://localhost:80
   - Backend API: http://localhost:3000

### Running Locally (Development)

#### 1. Setup PostgreSQL

Make sure PostgreSQL is running and create a database named `chat_app`.

#### 2. Setup Server

```bash
cd server
npm install

# Configure environment variables (create .env file)
# DB_HOST=localhost
# DB_PORT=5432
# DB_USER=postgres
# DB_PASSWORD=postgres
# DB_NAME=chat_app

# Initialize database
npm run db:push

# Start server
npm start
```

#### 3. Setup Client

```bash
cd client
npm install

# Start development server
npm run dev
```

The client will be available at http://localhost:5173

## 📡 API Endpoints

### REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/messages` | Get recent 50 messages |

### WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `connection` | Server ← Client | User connects to chat |
| `message` | Bidirectional | Send/receive messages |
| `disconnect` | Server ← Client | User disconnects |

## ⚙️ Configuration

### Client Settings

Settings are saved in `localStorage` under `blackout_settings`:

```typescript
{
  username: string;      // Display name
  serverUrl: string;     // Backend server URL
  isDemoMode: boolean;   // Enable demo mode
}
```

### Database Scripts

```bash
npm run db:generate   # Generate migrations
npm run db:migrate    # Run migrations
npm run db:push       # Push schema to database
npm run db:studio     # Open Drizzle Studio
npm run db:init       # Initialize database
```

## 🐳 Docker Services

| Service | Port | Description |
|---------|------|-------------|
| postgres | 5432 | PostgreSQL database |
| backend | 3000 | Express API server |
| frontend | 80 | React application |

## 🌐 Deployment

The application is configured for deployment on **Liara** cloud platform:

- Client: See `client/liara.json`
- Server: Configure with environment variables

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the ISC License.

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/javadderoom">Javad Deroom</a>
</p>
