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

// Feature flags / tunables
const ENABLE_REWRITE = (process.env.ENABLE_REWRITE || "false").toLowerCase() === "true";
const ENABLE_EXPAND = (process.env.ENABLE_EXPAND || "false").toLowerCase() === "true";
const ENABLE_RERANK = (process.env.ENABLE_RERANK || "false").toLowerCase() === "true";
const ENABLE_HYBRID_SCORE = (process.env.ENABLE_HYBRID_SCORE || "true").toLowerCase() === "true";

const EXPANSIONS = Number(process.env.EXPANSIONS || 2);
const RETRIEVE_TOPK = Number(process.env.RETRIEVE_TOPK || 5);
const RERANK_TOPK = Number(process.env.RERANK_TOPK || RETRIEVE_TOPK);
const CHUNK_SIZE = Number(process.env.CHUNK_SIZE || 300);
const CHUNK_OVERLAP = Number(process.env.CHUNK_OVERLAP || 120);
const MIN_SCORE = Number(process.env.MIN_SCORE || 0.45);
const CONTEXT_SNIPPET_CHARS = Number(process.env.CONTEXT_SNIPPET_CHARS || 200);
const VEC_WEIGHT = Number(process.env.VEC_WEIGHT || 0.7);
const KEY_WEIGHT = Number(process.env.KEY_WEIGHT || 0.3);
const KEYWORD_CONTENT_WEIGHT = Number(process.env.KEYWORD_CONTENT_WEIGHT || 0.6);
const KEYWORD_META_WEIGHT = Number(process.env.KEYWORD_META_WEIGHT || 0.4);

const DEFAULT_SYSTEM_PROMPT = `
You are an insurance assistant.

Answer using only the provided context. Keep it concise (1–2 sentences). If the answer is not in the context, say "I don't know." Do NOT mention context, sources, or IDs. Do not speculate.
`;

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
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });
  const chunks = await splitter.splitDocuments(rawDocs);

  const vectors = await embedTexts(chunks.map((c) => c.pageContent));

  const enriched = chunks.map((doc) => ({
    doc,
    headline: deriveHeadline(doc),
    summary: summarizeText(doc.pageContent),
  }));

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
        (doc.metadata?.source || "")
          .split(/[/\\\\]/)[0]
          .trim() || "unknown",
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

async function similaritySearchMongo(query, topK = RETRIEVE_TOPK) {
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
    .map((doc) => {
      const vectorScore = cosineSimilarity(queryEmb, doc.embedding);
      const keyScore =
        KEYWORD_CONTENT_WEIGHT * keywordScore(query, doc.content) +
        KEYWORD_META_WEIGHT * keywordScore(query, doc.metadata?.source || "");
      const score = ENABLE_HYBRID_SCORE
        ? VEC_WEIGHT * vectorScore + KEY_WEIGHT * keyScore
        : vectorScore;
      return {
        id: doc._id,
        document: doc.content,
        summary: doc.summary,
        headline: doc.headline,
        metadata: doc.metadata,
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}

async function reorderChunksWithLLM(chunks, query) {
  if (!ENABLE_RERANK || !chunks || chunks.length < 2) return chunks;

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
          content: "You reorder chunk IDs by relevance and reply with JSON array only.",
        },
        { role: "user", content: prompt },
      ],
      options: { temperature: 0.1, num_predict: 200 },
      timeout: 12000,
    });

    let content = res.data?.message?.content?.trim() || "";
    content = content.replace(/```json/i, "").replace(/```/g, "").trim();
    const start = content.indexOf("[");
    const end = content.lastIndexOf("]");
    if (start !== -1 && end !== -1 && end > start) content = content.slice(start, end + 1);
    content = content.replace(/'/g, '"').replace(/,\s*\]/g, "]").replace(/[\u0000-\u001F]+/g, " ");
    let ids;
    try {
      ids = JSON.parse(content);
    } catch (e) {
      const matches = Array.from(content.matchAll(/"([^"]+)"/g)).map((m) => m[1]);
      if (matches.length) ids = matches;
      else throw e;
    }
    if (!Array.isArray(ids)) throw new Error("Parsed reorder result is not array");

    const byId = Object.fromEntries(chunks.map((c) => [c.id, c]));
    const reordered = ids.map((id) => byId[id]).filter(Boolean);
    const remaining = chunks.filter((c) => !reordered.includes(c));
    return [...reordered, ...remaining].slice(0, RERANK_TOPK);
  } catch (err) {
    console.warn("Chunk rerank via LLM failed, keeping original order:", err.message);
    return chunks;
  }
}

async function rewriteQuery(query) {
  try {
    const res = await axios.post(`${OLLAMA_API_URL}/api/chat`, {
      model: MODEL_NAME,
      stream: false,
      messages: [
        { role: "system", content: "Rewrite questions concisely; no new facts; respond with plain text only." },
        { role: "user", content: `Rewrite the question to be clear, specific, and unambiguous while keeping meaning identical. Do NOT add or infer any new facts. Reply with the rewritten question only. Question: ${query}` },
      ],
      options: { temperature: 0.1, num_predict: 64 },
      timeout: 5000,
    });
    let rewritten = res.data?.message?.content || "";
    rewritten = rewritten.replace(/```/g, "").replace(/^['"]|['"]$/g, "").trim();
    if (rewritten) return rewritten;
  } catch (err) {
    console.warn("Query rewrite failed, using original:", err.message);
  }
  return query;
}

async function expandQuery(query, variants = EXPANSIONS) {
  const rewritten = query;
  if (!ENABLE_EXPAND) return [rewritten];
  try {
    const res = await axios.post(`${OLLAMA_API_URL}/api/chat`, {
      model: MODEL_NAME,
      stream: false,
      messages: [
        { role: "system", content: "You generate alternative phrasings; no new facts; respond with JSON array." },
        { role: "user", content: `Generate ${variants} alternative phrasings for this question. Keep meaning identical; do NOT add or assume new facts. Return a JSON array of strings. Question: ${rewritten}` },
      ],
      options: { temperature: 0.1, num_predict: 200 },
      timeout: 8000,
    });
    let content = res.data?.message?.content || "";
    content = content.replace(/```json/i, "").replace(/```/g, "").trim();
    const start = content.indexOf("[");
    const end = content.lastIndexOf("]");
    if (start !== -1 && end !== -1 && end > start) content = content.slice(start, end + 1);
    const arr = JSON.parse(content);
    const strings = Array.isArray(arr) ? arr.map((s) => String(s).trim()).filter(Boolean) : [];
    const dedup = Array.from(new Set([rewritten, ...strings]));
    return dedup;
  } catch (err) {
    console.warn("Query expansion failed, using rewritten only:", err.message);
    return [rewritten];
  }
}

function buildSystemPrompt(systemPrompt, contexts, query) {
  const contextBlock =
    contexts.length === 0
      ? "No relevant context found in the vector store."
      : contexts
          .map((ctx, idx) => {
            // 🔥 THIS is where it's used
            const keySentence = extractRelevantSentence(ctx.document, query);

            const snippet = ctx.document
              .replace(/\s+/g, " ")
              .slice(0, CONTEXT_SNIPPET_CHARS);

            return [
              `Context ${idx + 1}`,
              `Headline: ${ctx.headline || "N/A"}`,

              // 🔥 MOST IMPORTANT PART
              `Key Fact: ${keySentence || snippet}`,

              `Additional Context: ${snippet}`,
            ].join("\n");
          })
          .join("\n\n---\n\n");

  return `${systemPrompt}

Question: ${query}

Find the exact answer in the context below.

${contextBlock}`;
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
  const src = doc?.metadata?.source || "";
  const fileName = src.split(/[/\\\\]/).pop() || "";
  const titleFromFile = fileName.replace(/\.md$/i, "").replace(/[-_]/g, " ").trim();
  const firstLine = doc?.pageContent?.split(/\r?\n/).find((l) => l.trim()) || "";
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

export const ImpRAGService = {
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
      topK = RETRIEVE_TOPK,
      expansions = EXPANSIONS,
    } = options;

    const minPredict = Math.max(128, Number(maxTokens) || 0);

    const history = await chatService.getHistory();
    const recentMessages = history
      .slice(-5)
      .map(({ role, content }) => ({ role, content }));

    let baseQuery = message;
    if (ENABLE_REWRITE) {
      baseQuery = await rewriteQuery(message);
    }

    let queries = [baseQuery];
    if (ENABLE_EXPAND) {
      queries = await expandQuery(baseQuery, expansions);
    }

    let retrieved = [];
    for (const q of queries) {
      const hits = await similaritySearchMongo(q, topK);
      retrieved.push(...hits);
    }

    const byId = new Map();
    for (const hit of retrieved) {
      const prev = byId.get(hit.id);
      if (!prev || hit.score > prev.score) byId.set(hit.id, hit);
    }
    retrieved = Array.from(byId.values())
      .filter((r) => r.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score).filter((r) => r.score >= MIN_SCORE)
      .slice(0, topK);

    if (ENABLE_RERANK) {
      retrieved = await reorderChunksWithLLM(retrieved, queries[0]);
      retrieved = retrieved.slice(0, RERANK_TOPK);
    }

    const promptWithContext = buildSystemPrompt(systemPrompt, retrieved);
    const messages = [
      { role: "system", content: promptWithContext },
      // ...recentMessages, // uncomment if you want convo history
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
          num_predict: minPredict,
          top_p: topP,
        },
      });

      const content = response.data?.message?.content?.trim() || "";
      // console.log("final answer",content);
      
      await chatService.saveMessage("assistant", content);

      return { type: "text", message: content, contextUsed: retrieved };
    } catch (error) {
      console.error("Error calling Ollama:", error.message);
      throw new Error(`Failed to get response from Ollama: ${error.message}`);
    }
  },
};



function keywordScore(query, text) {
  const q = query.toLowerCase().split(" ");
  const t = text.toLowerCase();

  let score = 0;

  for (const word of q) {
    if (t.includes(word)) score += 1;
  }

  // 🔥 ONLY boost numbers if query expects numbers
  if (/\d+|how many|percentage|amount|total/i.test(query) && /\d+/.test(t)) {
    score += 2;
  }

  return score / q.length;
}
