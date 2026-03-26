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

### Database (SQLite + MongoDB)
- Stores chat messages
- Tracks user and assistant responses
- Lightweight and file-based
- MongoDB was vectorized for embeddings/vector search

### LLM (Ollama)
- Local Llama model inference
- Configurable model selection
- No API keys needed
- Mentioned model: Qwen 2.5:3B

## Chat Experiences (Front-End → Backend)
- 🧠 **Basic Chat** (`/basic-llm` in UI menu) → `/api/chat`  
  - Best for: open-ended Q&A, brainstorming, short answers without retrieval.  
  - Flow: single Ollama (Qwen 2.5:3B) turn; no tools, no vector search.
- 🛠️ **Tool-Based Chat** (`/tooling-llm` in UI menu) → `/api/chat`  
  - Best for: order lookups, cancellations, item/status queries stored in SQLite.  
  - Flow: LLM emits JSON tool calls; `llamaService` runs order tools against `server/src/db/database.js` (orders/users/products tables) and loops up to 5 times to return a final summary.
- 🧭 **Modified RAG Chat** (`/ModifiedRAG` in UI menu) → `/api/chatModRAG`  
  - Best for: fact-finding over provided documents (company/products/contracts) stored under `server/src/data/knowledge-base/` (Mongo vector store).  
  - Flow: hybrid retrieval (vector + keyword) with optional rewrite/expand/rerank, strict system prompt for grounded, calculation-friendly answers.

## Evaluation & QA
- Scripts are included to automatically check answer correctness against reference data.
- Evaluations run over a provided `.jsonl` file containing question/answer pairs.
- Reported metrics include accuracy, mean reciprocal rank (MRR), and related retrieval scores.

- ## Feature Highlights
- 🗂️ **Conversation history** persisted in SQLite (`server/data/chat.db`) with clear/restore endpoints; answers stored here cover whatever the user asked (from quick brainstorming to tool/RAG replies) and can be replayed via `/api/chat/history`.
- 🧰 **Tool-aware prompts** in `ToolingLLM.jsx` that detect tool JSON and hit SQLite order tools.
- 🧮 **Multiple model pathways**: core Ollama chat plus Mongo-backed RAG (Modified) for grounded answers.
- 🧭 **Vector search**: MongoDB vector store (chunks from `server/src/data/knowledge-base/`) powers RAG retrieval.
- 📊 **Evaluator scripts** in `server/evaluation/` run against `.jsonl` datasets and emit HTML/JSON reports (accuracy, MRR, nDCG, keyword coverage).
- 📝 **Sample datasets**: `server/evaluation/tests.jsonl` (and variants) contain question/answer/keyword triples used for grading.
- 🎛️ **Menu-driven UI** (`client/src/components/MenuBar.jsx` + `lessons.js`) so users can switch among chat modes from the same frontend.

## How the Three Modes Behave (Backend Deep Dive)
- 🧠 **Basic Chat**  
  - Handler: `llamaService.generateResponse` (single pass, no tools enabled in this path).  
  - Question fit: generic chit-chat, short form explanations, creative prompts.  
  - Data touchpoints: none beyond chat history; cheapest/simplest path.

- 🛠️ **Tool-Based Chat**  
  - Handler: `llamaService.generateResponse` with tool-calling loop (max 5).  
  - Tools (SQLite via `server/src/db/database.js`): `getOrderStatus`, `getOrderItems`, `getOrderDetails`, `searchOrders`, `getUserIdByName`, cancel/update helpers.  
  - Question fit: order status, item lists, user order history, cancellations, filtered searches (by user, status, orderId).  
  - Flow: model emits JSON call → tool runs on SQLite tables → result fed back → final friendly answer.

- 🧭 ** RAG Chat**  
  - Handler: `modifiedRAGService.generateResponse`.  
  - Corpus: Markdown docs in `server/src/data/knowledge-base/` chunked & embedded into MongoDB (collection `ol_chunks`).  
  - Retrieval: hybrid (vector + keyword boost), optional rewrite/expand/rerank flags; strict system prompt for grounded answers and numeric rollups.  
  - Question fit: policy/product/employee/contract facts, “how many/total/sum/combined” aggregations, timeline and relationship questions that must cite document-grounded facts.

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
  "message": "Give three bullet points on how vector search works in MongoDB."
}
```

Response:
```json
{
  "message": [
    "Store embeddings for documents in a vector field.",
    "Use a vector index to find nearest neighbors to the query embedding.",
    "Return the top-k documents scored by cosine similarity or dot product."
  ]
}
```

### POST /chatHF
Hugging Face backend (alternate model path).

### POST /chatRAG
Baseline retrieval-augmented answers over local knowledge base (Mongo vectors).

### POST /chatLang
LangChain RAG pipeline (Mongo vectors, MiniLM embeddings).

### POST /chatImpLang
Improved RAG with hybrid scoring, optional rewrite/expand/rerank.

### POST /chatModRAG
Modified RAG with strict grounded answering and hybrid retrieval.

### GET /chat/history
Fetch stored conversation history from SQLite.

### DELETE /chat/history
Clear stored conversation history.

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
