# AI Chat Application

A full-stack JavaScript application for chatting with a local Llama LLM through a modern web interface.

## 🏗️ Architecture

### Client (React + Vite)
- Modern chat UI built with React
- Real-time message display
- Message history from server
- Responsive design

### Server (Express.js)
- RESTful API endpoints
- SQLite database for message persistence
- Integration with Ollama for LLM inference
- CORS enabled for client communication

### Database (SQLite)
- Stores chat messages
- Tracks user and assistant responses
- Lightweight and file-based

### LLM (Ollama)
- Local Llama model inference
- Configurable model selection
- No API keys needed

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ 
- [Ollama](https://ollama.ai/) installed and running
- Default Ollama port: `http://localhost:11434`

### 1. Install Dependencies

**Client:**
```bash
cd client
npm install
```

**Server:**
```bash
cd server
npm install
```

### 2. Configure Environment (Server)

Copy the example env file and update if needed:
```bash
cd server
cp .env.example .env
```

Default settings:
- PORT: 3000
- OLLAMA_API_URL: http://localhost:11434
- MODEL_NAME: llama2

### 3. Start the Server

```bash
cd server
npm run dev
```

The server will start on `http://localhost:3000`

### 4. Start the Client (New Terminal)

```bash
cd client
npm run dev
```

The client will start on `http://localhost:5173`

### 5. Open in Browser

Navigate to `http://localhost:5173` and start chatting!

## 📁 Project Structure

```
js/
├── client/                    # React frontend
│   ├── src/
│   │   ├── components/       # React components
│   │   ├── api/               # API integration layer
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   └── package.json
├── server/                    # Express backend
│   ├── src/
│   │   ├── db/               # Database setup
│   │   ├── routes/           # API routes
│   │   ├── services/         # Business logic
│   │   └── index.js
│   ├── data/                 # SQLite database files (created at runtime)
│   └── package.json
└── README.md
```

## 🔌 API Endpoints

### POST /chat
Send a message to the Llama model
```json
{
  "message": "What is the capital of France?"
}
```

Response:
```json
{
  "message": "The capital of France is Paris."
}
```

### GET /chat/history
Retrieve all previous messages

Response:
```json
{
  "messages": [
    {
      "id": 1,
      "role": "user",
      "content": "What is the capital of France?",
      "timestamp": "2024-03-09T10:00:00"
    }
  ]
}
```

### DELETE /chat/history
Clear all chat history

## 🛠️ Configuration

### Changing the LLM Model
Edit `server/.env`:
```bash
MODEL_NAME=mistral    # or any other Ollama model
```

Available models can be listed with:
```bash
ollama list
```

Pull new models with:
```bash
ollama pull mistral
```

## 🚧 Troubleshooting

### Connection refused on port 3000
- Server not running. Start it with `npm run dev` in server directory

### Ollama connection error
- Ensure Ollama is running: `ollama serve`
- Check OLLAMA_API_URL in .env matches your Ollama endpoint

### Chat UI not loading
- Client not running. Start it with `npm run dev` in client directory
- Check browser console for errors
- Ensure proxy is correctly configured in `vite.config.js`

### Empty database on restart
- First time setup - chat history is stored in `server/data/chat.db`

## 📝 Development

### Live Development
- Client: Hot module replacement (HMR) via Vite
- Server: Auto-restart with `--watch` flag in npm script

### Database Inspection
SQLite database is stored at `server/data/chat.db`. View with any SQLite client:
```bash
sqlite3 server/data/chat.db
```

## 🔐 Security Notes
- This is a local development setup
- No authentication implemented
- Use environment variables for sensitive config
- Consider adding authentication for production use

## 📦 Dependencies

**Client:**
- React 18.2
- Vite 4.4
- Axios for HTTP requests

**Server:**
- Express.js 4.18
- SQLite3 5.1
- CORS enabled
- Axios for Ollama communication

## 📄 License
MIT
