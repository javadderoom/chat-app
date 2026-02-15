# Blackout Chat

A sleek, terminal-inspired real-time chat application that brings a hacker aesthetic to modern messaging.

![Version](https://img.shields.io/badge/version-1.0.4--alpha-green)
![License](https://img.shields.io/badge/license-ISC-blue)

## What is Blackout Chat?

Blackout Chat is a real-time messaging app designed with a dark, terminal-inspired interface. Whether you're connecting with friends locally or hosting your own chat server, it offers a unique visual experience combined with powerful features.

## Features

### Core Messaging
- **Real-time messaging** - Messages delivered instantly via WebSocket connections
- **Chat rooms** - Create and join different conversation channels
- **Message history** - All messages persist in PostgreSQL database

### Rich Media
- **Voice messages** - Record and send audio clips
- **Image sharing** - Upload and share photos
- **Stickers** - Express yourself with animated stickers

### Communication Tools
- **Reply to messages** - Reference specific messages in conversations
- **Forward messages** - Share messages between chats
- **Reactions** - React to messages with emojis
- **Pinned messages** - Pin important messages to the top of each chat

### Message Management
- **Edit messages** - Modify your sent messages
- **Delete messages** - Remove messages (soft-delete keeps history)
- **Unpin messages** - Remove previously pinned chat highlights
- **Message status** - See when messages are modified or deleted

### User Experience
- **Demo mode** - Test the app without connecting to a server
- **Custom username** - Personalize your display name
- **Settings panel** - Configure server URL and preferences
- **Responsive design** - Works on desktop, tablet, and mobile

## Getting Started

### Quick Start with Docker

```bash
# Clone and navigate to the project
cd chat-app

# Start all services with Docker
docker-compose up -d
```

Then open http://localhost in your browser.

### Development Mode

**Backend:**
```bash
cd server
npm install
npm run db:push  # Set up database
npm start        # Runs on port 3000
```

**Frontend:**
```bash
cd client
npm install
npm run dev      # Runs on port 5173
```

## User Interface

The interface features a dark, terminal-inspired design with:
- Monospace typography for authentic terminal feel
- Green accent colors on dark backgrounds
- Minimal, distraction-free layout
- Smooth animations and transitions

### Screens

1. **Login/Register** - Create an account or sign in
2. **Chat List** - Browse available chat rooms
3. **Chat View** - Send and receive messages
4. **Settings** - Customize your experience

## Technical Overview

Built with modern web technologies:
- **Frontend:** React 19, TypeScript, Vite, TailwindCSS
- **Backend:** Express 5, Socket.IO, Node.js
- **Database:** PostgreSQL with Drizzle ORM
- **Real-time:** WebSocket connections for instant messaging

## Support

For issues and feature requests, visit the [GitHub repository](https://github.com/javadderoom/blackout-chat).

---

Made with ❤️ by [Javad Deroom](https://github.com/javadderoom)
