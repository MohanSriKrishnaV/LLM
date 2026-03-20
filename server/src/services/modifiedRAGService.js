import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Document } from "@langchain/core/documents";
import { pipeline } from "@xenova/transformers";
import { connectMongo, getMongoDb } from "../db/mongoClient.js";
import { chatService } from "./chatService.js";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const OLLAMA_API_URL = process.env.OLLAMA_API_URL || "http://localhost:11434";
const MODEL_NAME = process.env.MODEL_NAME || "qwen2.5:3b";
const OL_COLLECTION = process.env.OL_COLLECTION || "ol_chunks";
const EMBED_MODEL = process.env.EMBED_MODEL || "Xenova/all-MiniLM-L6-v2"; // local, no API key

const DEFAULT_SYSTEM_PROMPT = [
  "You represent an insurance company.",
  "Answer questions about employees and products using the retrieved context.",
  "Answer the user's question naturally and conversationally.",
  "Use the provided context only as background knowledge.",
  "Keep answers brief; if unsure, say you don't know.",
  "Do NOT mention the context or say anything like based on the context and the information provided such as based on the context proivded or based on the information provided",
  "Just give a clean, human-like readable answer.",
].join(" ");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OL_ROOT = path.resolve(__dirname, "../data/knowledge-base");

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
        metadata: { source: path.relative(OL_ROOT, fullPath) },
      }),
    );
  }

  return docs;
}

export async function loadBase() {
  if (baseLoaded) return;
  console.log("Loading knowledge base...");

  const mongoClient = await connectMongo();
  const db = getMongoDb();
  if (!mongoClient || !db) {
    console.warn(
      "MongoDB connection unavailable; LangService will run without knowledge base context.",
    );
    baseLoaded = true;
    return;
  }

  const rawDocs = await readMarkdownDocs(OL_ROOT);
  // Use recursive character splitter for predictable chunks
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 600,
    chunkOverlap: 120,
  });
  const chunks = await splitter.splitDocuments(rawDocs);

  const vectors = await embedTexts(chunks.map((c) => c.pageContent));

  // Enrich each chunk with heuristic headline/summary (no LLM needed)
  const enriched = [];
  for (const doc of chunks) {
    enriched.push({
      doc,
      headline: deriveHeadline(doc),
      summary: summarizeText(doc.pageContent),
    });
  }

  const collection = db.collection(OL_COLLECTION);
  await collection.deleteMany({});

  const payload = enriched.map(({ doc, headline, summary }, idx) => ({
    _id: `${doc.metadata?.source || "unknown"}::${idx}`,
    content: doc.pageContent,
    summary,
    headline,
    metadata: {
      source: doc.metadata?.source,
      chunk: idx,
      type:
        (doc.metadata?.source || "").split(/[/\\\\]/)[0].trim() || "unknown",
      wordCount: doc.pageContent.split(/\s+/).length,
      createdAt: new Date(),
    },
    embedding: vectors[idx],
  }));

  if (payload.length) {
    await collection.insertMany(payload, { ordered: false });
    console.log(
      `LangService: loaded ${payload.length} OL chunks into Mongo collection ${OL_COLLECTION}`,
    );
  } else {
    console.warn("LangService: no knowledge-base documents found to ingest.");
  }

  baseLoaded = true;
}

async function similaritySearchMongo(query, topK = 12) {
  const db = getMongoDb();
  if (!db) return [];

  const collection = db.collection(OL_COLLECTION);
  const docs = await collection
    .find(
      {},
      {
        projection: {
          content: 1,
          summary: 1,
          headline: 1,
          metadata: 1,
          embedding: 1,
        },
      },
    )
    .toArray();

  if (docs.length === 0) return [];

  const [queryEmb] = await embedTexts([query]);

  const scored = docs
    .map((doc) => ({
      id: doc._id,
      document: doc.content,
      summary: doc.summary,
      headline: doc.headline,
      metadata: doc.metadata,
      score: cosineSimilarity(queryEmb, doc.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  // console.log("scored",scored);

  return scored;
}

async function reorderChunksWithLLM(chunks, query) {
  // If fewer than 2 chunks, no reordering needed
  if (!chunks || chunks.length < 2) return chunks;

  // Build a concise list of chunk refs for the model
  const listing = chunks
    .map(
      (c, i) =>
        `Chunk ${i + 1} | id=${c.id} | score=${c.score.toFixed(
          3,
        )}\nHeadline: ${c.headline || "N/A"}\nSummary/snippet: ${summarizeText(
          c.document,
          320,
        )}`,
    )
    .join("\n\n");

  const prompt = `You are reranking retrieved context chunks for a question.

Question: ${query}

Chunks (in current order):
${listing}

Return only a JSON array of chunk ids in the best order for answering the question, most relevant first. Example: ["docA::0","docB::1"]`;

  try {
    const res = await axios.post(`${OLLAMA_API_URL}/api/chat`, {
      model: MODEL_NAME,
      stream: false,
      messages: [
        {
          role: "system",
          content:
            "You reorder chunk IDs by relevance and reply with JSON array only.",
        },
        { role: "user", content: prompt },
      ],
      options: { temperature: 0, num_predict: 200 },
      timeout: 12000,
    });

    let content = res.data?.message?.content?.trim() || "";
    content = content
      .replace(/```json/i, "")
      .replace(/```/g, "")
      .trim();
    const start = content.indexOf("[");
    const end = content.lastIndexOf("]");
    if (start !== -1 && end !== -1 && end > start) {
      content = content.slice(start, end + 1);
    }
    // Normalize common mistakes: single quotes, trailing commas, control chars
    content = content
      .replace(/'/g, '"')
      .replace(/,\s*\]/g, "]")
      .replace(/[\u0000-\u001F]+/g, " ")
      .trim();
    let ids;
    try {
      ids = JSON.parse(content);
    } catch (parseErr) {
      // Fallback: extract quoted tokens
      const matches = Array.from(content.matchAll(/"([^"]+)"/g)).map(
        (m) => m[1],
      );
      if (matches.length) {
        ids = matches;
      } else {
        throw parseErr;
      }
    }
    if (!Array.isArray(ids))
      throw new Error("Parsed reorder result is not array");

    // Map ids to chunks; keep original if missing
    const byId = Object.fromEntries(chunks.map((c) => [c.id, c]));
    const reordered = ids.map((id) => byId[id]).filter(Boolean);

    // Append any chunks not returned by the model (to preserve recall)
    const remaining = chunks.filter((c) => !reordered.includes(c));
    return [...reordered, ...remaining].slice(0, 6);
  } catch (err) {
    console.warn(
      "Chunk rerank via LLM failed, keeping original order:",
      err.message,
    );
    return chunks;
  }
}

async function rewriteQuery(query) {
  try {
    const prompt = `Rewrite the question to be clear, specific, and unambiguous while keeping meaning identical. Do NOT add or infer any new facts. Reply with the rewritten question only.`;
    const res = await axios.post(`${OLLAMA_API_URL}/api/chat`, {
      model: MODEL_NAME,
      stream: false,
      messages: [
        {
          role: "system",
          content:
            "Rewrite questions concisely; no new facts; respond with plain text only.",
        },
        { role: "user", content: query },
      ],
      options: { temperature: 0, num_predict: 64 },
      timeout: 5000,
    });
    let rewritten = res.data?.message?.content || "";
    rewritten = rewritten
      .replace(/```/g, "")
      .replace(/^["']|["']$/g, "")
      .trim();
    if (rewritten) return rewritten;
  } catch (err) {
    console.warn("Query rewrite failed, using original:", err.message);
  }
  return query;
}

async function expandQuery(query, variants = 2) {
  const rewritten = await rewriteQuery(query);
  try {
    const prompt = `Generate ${variants} alternative phrasings for this question. Keep meaning identical; do NOT add or assume new facts. Return a JSON array of strings.\nQuestion: ${rewritten}`;
    const res = await axios.post(`${OLLAMA_API_URL}/api/chat`, {
      model: MODEL_NAME,
      stream: false,
      messages: [
        {
          role: "system",
          content:
            "You generate alternative phrasings; no new facts; respond with JSON array.",
        },
        { role: "user", content: prompt },
      ],
      options: { temperature: 0.2, num_predict: 200 },
      timeout: 8000,
    });
    let content = res.data?.message?.content || "";
    content = content
      .replace(/```json/i, "")
      .replace(/```/g, "")
      .trim();
    const start = content.indexOf("[");
    const end = content.lastIndexOf("]");
    if (start !== -1 && end !== -1 && end > start)
      content = content.slice(start, end + 1);
    const arr = JSON.parse(content);
    const strings = Array.isArray(arr)
      ? arr.map((s) => String(s).trim()).filter(Boolean)
      : [];
    const dedup = Array.from(new Set([rewritten, ...strings]));
    return dedup;
  } catch (err) {
    console.warn("Query expansion failed, using rewritten only:", err.message);
    return [rewritten];
  }
}

function buildSystemPrompt(systemPrompt, contexts) {
  const contextBlock =
    contexts.length === 0
      ? "No relevant context found in the vector store."
      : contexts
          .map(
            (ctx, idx) =>
              `Context ${idx + 1} (id: ${ctx.id}):
Headline: ${ctx.headline || "N/A"}
Summary: ${ctx.summary || "N/A"}
Content:
${ctx.document.trim()}`,
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

function deriveHeadline(doc) {
  // Prefer filename (without directories) as a simple headline fallback
  const src = doc?.metadata?.source || "";
  const fileName = src.split(/[/\\\\]/).pop() || "";
  const titleFromFile = fileName
    .replace(/\.md$/i, "")
    .replace(/[-_]/g, " ")
    .trim();

  // Try first markdown heading if present
  const firstLine =
    doc?.pageContent?.split(/\r?\n/).find((l) => l.trim()) || "";
  const headingMatch = firstLine.match(/^#\s*(.+)/);
  if (headingMatch) return headingMatch[1].trim();

  return titleFromFile || "Untitled";
}

function summarizeText(text, maxLen = 240) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  const truncated = clean.slice(0, maxLen);
  const lastDot = truncated.lastIndexOf(".");
  if (lastDot > 60) return truncated.slice(0, lastDot + 1).trim();
  return truncated.trim() + "...";
}

export const modifiedRAGService = {
  loadBase,
  generateResponse: async (
  message,
  systemPrompt = DEFAULT_SYSTEM_PROMPT,
  options = {}
) => {
  const {
    temperature = 0.2,
    maxTokens = 200,
    topP = 0.9,
  } = options;

  await chatService.saveMessage("user", message);

  // 🔥 STEP 1: Simple retrieval (NO expansion, NO rewrite)
  let retrieved = await similaritySearchMongo(message, 6);

  // 🔥 STEP 2: Filter weak matches (CRITICAL)
  retrieved = retrieved
    .filter((r) => r.score > 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3); // only top 3

  // 🔥 STEP 3: Build CLEAN context (no summaries, no headlines)
  const contextBlock =
    retrieved.length === 0
      ? "No relevant information found."
      : retrieved
          .map((ctx, i) => {
            const clean = ctx.document
              .replace(/\s+/g, " ")
              .slice(0, 300); // HARD LIMIT

            return `(${i + 1}) ${clean}`;
          })
          .join("\n");

  const finalSystemPrompt = `
${systemPrompt}

Use ONLY the relevant information below:

${contextBlock}
`;

  const messages = [
    { role: "system", content: finalSystemPrompt },
    { role: "user", content: message },
  ];

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

    return {
      type: "text",
      message: content,
      contextUsed: retrieved,
    };
  } catch (error) {
    console.error("Error calling Ollama:", error.message);
    throw new Error(`Failed to get response from Ollama: ${error.message}`);
  }
}
};

export default modifiedRAGService