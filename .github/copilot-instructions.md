## AI Chat Application - Workspace Setup Guide

This workspace contains a full-stack JavaScript chat application with React frontend, Express.js backend, SQLite database, and Ollama LLM integration.

### Project Structure
- **client/**: React + Vite frontend application
- **server/**: Express.js backend with SQLite integration
- **README.md**: Complete documentation and setup guide

### Getting Started

#### 1. Install Dependencies
```bash
# Client dependencies
cd client && npm install

# Server dependencies  
cd server && npm install
```

#### 2. Start the Services
```bash
# Terminal 1 - Start Server
cd server
npm run dev

# Terminal 2 - Start Client (5173)
cd client
npm run dev

# Ensure Ollama is Running
# In another terminal:
ollama serve
```

#### 3. Access the Application
- Client: http://localhost:5173
- Server: http://localhost:3000
- Ollama: http://localhost:11434

### Prerequisites
- Node.js 16+
- Ollama installed and running
- Available models: `ollama list`

### Configuration
**Server** (.env file - create from .env.example):
- PORT: 3000
- OLLAMA_API_URL: http://localhost:11434
- MODEL_NAME: llama2 (or other available models)

### Key Files
- Server entry: `server/src/index.js`
- Client entry: `client/src/main.jsx`
- Chat routes: `server/src/routes/chatRoutes.js`
- Database setup: `server/src/db/database.js`
- Llama service: `server/src/services/llamaService.js`

### Troubleshooting
1. **Connection refused**: Ensure both client and server are running
2. **Ollama errors**: Run `ollama serve` in separate terminal
3. **Database errors**: SQLite database creates automatically in `server/data/`

### Development Notes
- Client uses Vite with HMR for hot reloading
- Server uses `--watch` flag for auto-restart
- CORS enabled on server for client communication
- By default proxies `/api` requests to server

### API Endpoints
- POST `/chat` - Send message to Llama
- GET `/chat/history` - Retrieve chat history
- DELETE `/chat/history` - Clear all messages

For detailed documentation, see [README.md](../../README.md)
