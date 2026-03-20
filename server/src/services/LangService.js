import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { MarkdownTextSplitter, RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";
import { pipeline } from "@xenova/transformers";
import { connectMongo, getMongoDb } from "../db/mongoClient.js";
import { chatService } from "./chatService.js";

const OLLAMA_API_URL = process.env.OLLAMA_API_URL || "http://localhost:11434";
const MODEL_NAME = process.env.MODEL_NAME || "qwen2.5:3b";
const KB_COLLECTION = process.env.KB_COLLECTION || "kb_chunks";
const EMBED_MODEL = process.env.EMBED_MODEL || "Xenova/all-MiniLM-L6-v2"; // local, no API key

const DEFAULT_SYSTEM_PROMPT = [
  "You represent an insurance company.",
  "Answer questions about employees and products using the retrieved context.",
  "Answer the user's question naturally and conversationally.",
"Use the provided context only as background knowledge.",
  "Keep answers brief; if unsure, say you don't know.",
  "Do NOT mention the context or say anything like based on the context and the information provided",
"Just give a clean, human-like readable answer."

].join(" ");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KB_ROOT = path.resolve(__dirname, "../data/knowledge-base");

let baseLoaded = false;
let embedderPromise;

function getEmbedder() {
  if (!embedderPromise) {
    embedderPromise = pipeline("feature-extraction", EMBED_MODEL, {
      quantized: true,
    });
  }
  return embedderPromise;
}

async function embedTexts(texts) {
  const embedder = await getEmbedder();
  const results = await Promise.all(
    texts.map((t) =>
      embedder(t, {
        pooling: "mean",
        normalize: true,
      }),
    ),
  );
  return results.map((res) => Array.from(res.data));
}

async function readMarkdownDocs(rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const docs = [];

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      const nested = await readMarkdownDocs(fullPath);
      docs.push(...nested);
      continue;
    }

    if (!entry.name.toLowerCase().endsWith(".md")) continue;

    const content = await fs.readFile(fullPath, "utf-8");
    docs.push(
      new Document({
        pageContent: content,
        metadata: { source: path.relative(KB_ROOT, fullPath) },
      }),
    );
  }

  return docs;
}

export async function loadBase() {
  if (baseLoaded) return;

  const mongoClient = await connectMongo();
  const db = getMongoDb();
  if (!mongoClient || !db) {
    console.warn(
      "MongoDB connection unavailable; LangService will run without knowledge base context.",
    );
    baseLoaded = true;
    return;
  }

  const rawDocs = await readMarkdownDocs(KB_ROOT);
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 800,
    chunkOverlap: 120,
  });
  // MarkdownTextSplitter
  const chunks = await splitter.splitDocuments(rawDocs);

  const vectors = await embedTexts(chunks.map((c) => c.pageContent));

  const collection = db.collection(KB_COLLECTION);
  await collection.deleteMany({});

  const payload = chunks.map((doc, idx) => ({
    _id: `${doc.metadata?.source || "unknown"}::${idx}`,
    content: doc.pageContent,
    metadata: {
      source: doc.metadata?.source,
      chunk: idx,
      type:
        (doc.metadata?.source || "")
          .split(/[/\\\\]/)[0]
          .trim() || "unknown",
    },
    embedding: vectors[idx],
  }));

  if (payload.length) {
    await collection.insertMany(payload, { ordered: false });
    console.log(
      `LangService: loaded ${payload.length} KB chunks into Mongo collection ${KB_COLLECTION}`,
    );
  } else {
    console.warn("LangService: no knowledge-base documents found to ingest.");
  }

  baseLoaded = true;
}

async function similaritySearchMongo(query, topK = 3) {
  const db = getMongoDb();
  if (!db) return [];

  const collection = db.collection(KB_COLLECTION);
  const docs = await collection
    .find({}, { projection: { content: 1, metadata: 1, embedding: 1 } })
    .toArray();

  if (docs.length === 0) return [];

  const [queryEmb] = await embedTexts([query]);

  const scored = docs
    .map((doc) => ({
      id: doc._id,
      document: doc.content,
      metadata: doc.metadata,
      score: cosineSimilarity(queryEmb, doc.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);


// console.log("scored",scored);

  return scored;
}

function buildSystemPrompt(systemPrompt, contexts) {
  const contextBlock =
    contexts.length === 0
      ? "No relevant context found in the vector store."
      : contexts
          .map(
            (ctx, idx) =>
              `Context ${idx + 1} (id: ${ctx.id}):\n${ctx.document.trim()}`,
          )
          .join("\n\n");

  return `${systemPrompt}\n\nRetrieved context:\n${contextBlock}`;
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export const LangService = {
  loadBase,
  generateResponse: async (
    message,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    options = {},
  ) => {
    const {
      temperature = 0.3,
      maxTokens = 500,
      topP = 0.9,
      topK = 3,
    } = options;

    // await loadBase();S

    const history = await chatService.getHistory();
    const recentMessages = history
      .slice(-5)
      .map(({ role, content }) => ({ role, content }));

    const retrieved = await similaritySearchMongo(message, topK);
    const promptWithContext = buildSystemPrompt(systemPrompt, retrieved);

    const messages = [
      { role: "system", content: promptWithContext },
      // ...recentMessages, //uncomment to include recent messages in context
      { role: "user", content: message },
    ];
    await chatService.saveMessage("user", message);

    try {
      const response = await axios.post(`${OLLAMA_API_URL}/api/chat`, {
        model: MODEL_NAME,
        messages,
        stream: false,
        options: {
          temperature,
          num_predict: maxTokens,
          top_p: topP,
        },
      });

      const content = response.data?.message?.content?.trim() || "";
      await chatService.saveMessage("assistant", content);

      return { type: "text", message: content, contextUsed: retrieved };
    } catch (error) {
      console.error("Error calling Ollama:", error.message);
      throw new Error(`Failed to get response from Ollama: ${error.message}`);
    }
  },
};
