import express from 'express'
import cors from 'cors'
import chatRoutes from './routes/chatRoutes.js'
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { connectMongo } from './db/mongoClient.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, 'config.env') });

console.log("process",process.env.HF_API_KEY)

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(cors())
app.use(express.json())

// Routes
app.use('/', chatRoutes)

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK' })
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err)
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  })
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  console.log(`CORS enabled - Client can connect from http://localhost:5173`)
  console.log(`Ollama endpoint: ${process.env.OLLAMA_API_URL || 'http://localhost:11434'}`)

  connectMongo()
    .then((client) => {
      if (client) {
        console.log("MongoDB connection established");
      } else {
        console.log("MongoDB connection skipped (missing config or dependency).");
      }
    })
    .catch((err) => {
      console.error("MongoDB connection failed:", err.message);
    });
})
