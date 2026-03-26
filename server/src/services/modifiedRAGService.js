import axios from "axios";
import { connectMongo, getMongoDb } from "../db/mongoClient.js";
import { chatService } from "./chatService.js";
import { pipeline } from "@xenova/transformers";

const OLLAMA_API_URL = process.env.OLLAMA_API_URL || "http://localhost:11434";
const MODEL_NAME = process.env.MODEL_NAME || "qwen2.5:3b";
const OL_COLLECTION = process.env.OL_COLLECTION || "ol_chunks";
const DB_NAME = process.env.MONGODB_DB || "LLM";
const EMBED_MODEL = process.env.EMBED_MODEL || "Xenova/all-MiniLM-L6-v2";
let baseLoaded = false;

let embedderPromise;

/* ================= EMBEDDING ================= */

// - Do NOT mix information from different chunks unless the query needs information from different chunks.
// - If multiple people are mentioned, choose the one directly tied to the question.

// answered nos directly
// const SYSTEM_PROMPT=`
// You are a helpful AI assistant.
//  Use ONLY the most relevant context chunk.
//  - Identify ALL relevant entries.
// - Be precise.
// use the context when u feel that the answer of the context lies in the context or else answer directly
// - If the answer is clearly in the context, respond concisely.
// - If the answer is NOT in the context, say: "I don't know".
// - Do NOT make up information.
// - Do NOT use outside knowledge.
// - Keep answers short and clear (max 3-4 sentences).
// `;

// answering propelry but added extra info
// const SYSTEM_PROMPT = `
// You are a  question-answering assistant using retrieved context.

// RULES:

// 1. Use  the suitable provided context to answer.
// 2. Do NOT use outside knowledge.
// 3. Do NOT guess or assume missing information.

// UNDERSTANDING THE TASK:

// - If the answer is directl fact stated → answer it clearly.
// - If information is spread across multiple sections → combine them carefully.
// - If the question requires calculation (total, sum, combined):
//   - Extract all relevant numbers from context
//   - Perform the calculation
//   - If any number is missing → say "I don't know"

//   CRITICAL:
// - Only use numerical values if they are explicitly linked to the correct entity.
// - Do NOT assign numbers to entities unless clearly stated.
// - If a number refers to a total or general statement, do NOT apply it to a specific item.
// - Always include all relevant entity attributes (names, positions, company, product) when answering relationship questions

// TASK HANDLING:
// - For direct questions → return the full answer using all relevant context- For multi-step questions → combine carefully
// - For comparison questions (e.g., "most", "highest"):
//   - Only compare entities with clearly stated values

// HANDLING MULTIPLE ENTITIES:

// - If multiple entities are mentioned:
//   - Select ONLY the one that matches the question
//   - Do NOT mix information from different entities

// FAILURE CONDITION:

// - Only say "I don't know" if the context truly lacks the information.
// - Otherwise, combine all available context for a full answer.

// STYLE:

// - Provide complete answers using all relevant context
// - Be precise and clear
// - Include entity attributes and context even if the answer is a single number or date

// `;

// - For simple factual answers (numbers, dates, yes/no) → include only the entity and value in the format:
//   [Entity]: [Value]
// - For numbers/dates → concise format: [Entity]: [Value].

// HANDLING MULTIPLE ENTITIES:

// - Do NOT mix information from different entities in one answer.

const USE_CHROMA = (process.env.USE_CHROMA || "false").toLowerCase() === "true";

const SYSTEM_PROMPT = `
You are a question-answering assistant using retrieved context.

RULES:

1. Use ONLY the provided context to answer.
2. Do NOT use outside knowledge.
3. Do NOT guess or assume missing information.
Do not add extra explanations which are irrelavnet.


UNDERSTANDING THE TASK:

- If the answer is directly stated → provide it clearly with relevant entity attributes.
- If information is spread across multiple sections → combine it carefully into a complete answer.
- If the question requires calculation (total, sum, combined):
  - Extract all relevant numbers from context.
  - Perform the calculation.
  - Show calculation steps if applicable.
  - If any number is missing → say "I don't know".

CRITICAL:

- Only use numerical values if they are explicitly linked to the correct entity.
- Do NOT assign numbers to entities unless clearly stated.
- If a number refers to a total or general statement, do NOT apply it to a specific item.
- Include entity attributes (names, positions, company, product) when answering relational or multi-step questions.


TASK HANDLING:

- For direct factual questions → return the answer concisely.
- For multi-step, holistic, or relational questions → combine all relevant context carefully.
- For comparison questions (e.g., "most", "highest") → only compare entities with clearly stated values.
- If multiple entities are mentioned → select only the ones those match the question.
- Only say "I don't know" if the context truly lacks the information.


STYLE:

- Be precise and clear.
- Include entity attributes only when necessary.
- For multi-step or relational answers → include all relevant context and calculation steps if needed.
- Do NOT add unnecessary explanatory sentences.
-only IF applicable :Name, Title at Company, Additional info if relevant to the question and needed 



DONTS :
adding statments like:
"This information is directly stated in the context provided for her."
"the context had this info in it etc "

EXAMPLE:
-BAD: "According to the context, Maxine won the award."
GOOD: "Maxine Thompson won the Insurellm Innovator of the Year (IIOTY) award in 2023."

`;

// ANSWER FORMAT :
// - only IF applicable :Name, Title at Company, Additional info if relevant
// such as Jennifer Rodriguez working as a Chief Executive Officer at Insurellm, Inc.


function getEmbedder() {
  if (!embedderPromise) {
    embedderPromise = pipeline("feature-extraction", EMBED_MODEL, {
      quantized: true,
    });
  }
  return embedderPromise;
}

async function embed(text) {
  const embedder = await getEmbedder();
  const res = await embedder(text, {
    pooling: "mean",
    normalize: true,
  });
  return Array.from(res.data);
}

/* ================= SEARCH ================= */

// async function similaritySearch(query, topK = 6) {
//   const db = getMongoDb();
//   if (!db) return [];

//   const collection = db.collection(OL_COLLECTION);

//   // 1. Fetch docs
//   const docs = await collection
//     .find({}, { projection: { content: 1, embedding: 1 } })
//     .toArray();

//   if (!docs.length) return [];

//   // 2. Embed query
//   const queryEmb = await embed(query);

//   // 3. Score all docs
//   let scoredDocs = docs.map((doc) => ({
//     document: doc.content,
//     score: cosineSimilarity(queryEmb, doc.embedding),
//   }));

//   // 4. Sort by similarity
//   scoredDocs.sort((a, b) => b.score - a.score);

//   // 🔍 DEBUG (keep this for now)
//   console.log("Top scores:", scoredDocs.slice(0, 5));

//   // 5. Apply threshold (soft)
//   let filteredDocs = scoredDocs.filter((doc) => doc.score > 0.3);

//   // 6. Fallback if nothing passes threshold
//   if (filteredDocs.length === 0) {
//     console.warn("No docs above threshold, using topK fallback");
//     filteredDocs = scoredDocs.slice(0, topK);
//   }

//   // 7. Return topK
//   return filteredDocs.slice(0, topK);
// }

// async function similaritySearch(query, topK = 6) {

//    topK = isAggregationQuery(query) ? 8 : 3;

//   const db = getMongoDb();
//   if (!db) return [];

//   const collection = db.collection(OL_COLLECTION);

//   const docs = await collection
//     .find({}, { projection: { content: 1, embedding: 1 } })
//     .toArray();

//   if (!docs.length) return [];

//   // ✅ STEP 1: keyword filter FIRST
// const keywords = query
//   .toLowerCase()
//   .split(" ")
//   .filter(w => w.length > 3); // remove noise words //check if small words get removed

// let keywordFiltered = docs.filter(doc =>
//   keywords.some(k => doc.content.toLowerCase().includes(k))
// );
//   // ⚠️ fallback if nothing matches keyword
//   if (keywordFiltered.length === 0) {
//     keywordFiltered = docs;
//   }

//   // ✅ STEP 2: embed query
//   const queryEmb = await embed(query);

//   // ✅ STEP 3: run similarity ONLY on filtered docs
//   let scoredDocs = keywordFiltered.map((doc) => ({
//     document: doc.content,
//     score: cosineSimilarity(queryEmb, doc.embedding),
//   }));

//   // ✅ STEP 4: sort
//   scoredDocs.sort((a, b) => b.score - a.score).filter(doc => doc.score > 0.25); //filter

//   // DEBUG
//   // console.log("Top scores:", scoredDocs.slice(0, 5));

//   // ✅ STEP 5: return topK
//   return scoredDocs.slice(0, topK);
// }
async function similaritySearch(query, topK) {
  if (USE_CHROMA) {
    return await similaritySearchChroma(query, topK);
  } else {
    return await similaritySearchMongo(query, topK);
  }
}

async function similaritySearchMongo(query, topK) {
  // Allow caller override; otherwise choose based on query type
  const effectiveTopK =
    topK !== undefined && topK !== null
      ? topK
      : isAggregationQuery(query)
        ? 8
        : 3;

  const db = getMongoDb();
  if (!db) return [];

  const collection = db.collection(OL_COLLECTION);

  let docs = await collection
    .find({}, { projection: { content: 1, embedding: 1 } })
    .toArray();

  if (!docs.length) return [];

  const queryLower = query.toLowerCase();

  // ✅ STEP 1: smarter keyword extraction
  const keywords = queryLower.split(/\s+/).filter((w) => w.length > 2); // less aggressive

  // ✅ STEP 2: keyword filtering (soft)
  let keywordFiltered = docs.filter((doc) =>
    keywords.some((k) => doc.content.toLowerCase().includes(k)),
  );

  // fallback if too strict
  if (keywordFiltered.length < 3) {
    keywordFiltered = docs;
  }

  // ✅ STEP 3: embed query
  const queryEmb = await embed(query);

  // ✅ STEP 4: hybrid scoring (semantic + keyword boost)
  let scoredDocs = keywordFiltered.map((doc) => {
    const contentLower = doc.content.toLowerCase();

    let score = cosineSimilarity(queryEmb, doc.embedding);

    // 🔥 keyword boost
    let boost = 0;
    for (const k of keywords) {
      if (contentLower.includes(k)) {
        boost += 0.1;
      }
    }

    return {
      document: doc.content,
      score: score + boost,
    };
  });

  // ✅ STEP 5: sort
  scoredDocs.sort((a, b) => b.score - a.score);

  // ✅ STEP 6: soft threshold with fallback
  let filtered = scoredDocs.filter((doc) => doc.score > 0.2);

  if (filtered.length === 0) {
    filtered = scoredDocs.slice(0, effectiveTopK);
  }

  // DEBUG (keep this!)
  // console.log("Top scores:", scoredDocs.slice(0, 5));

  // ✅ STEP 7: return topK
  return filtered.slice(0, effectiveTopK);
}

/* ================= MAIN ================= */

const ENABLE_REWRITE = process.env.ENABLE_REWRITE || "false";
const ENABLE_EXPAND = process.env.ENABLE_EXPAND || "false";
const ENABLE_RERANK = process.env.ENABLE_RERANK || "false";
const ENABLE_HYBRID_SCORE = process.env.ENABLE_HYBRID_SCORE || "true";
const minScore = process.env.MIN_SCORE || 0.35;
const SWITCH = process.env.SWITCH || "false";
// console.log(SWITCH, "SWITCH");

const EXPANSIONS = Number(process.env.EXPANSIONS || 2);

export const modifiedRAGService = {
  generateResponse: async (question, _unused = undefined, opts = {}) => {
    const { topK, temperature = 0.2, maxTokens = 150 } = opts;

    let baseQuery = question;
    let context;
    let prompt;
    let results;
    if (false) { //SWITCH
      if (ENABLE_REWRITE) {
        baseQuery = await rewriteQuery(baseQuery);
      }

      // 2️⃣ Optional: Expand query to multiple variants
      let queries = [baseQuery];
      if (ENABLE_EXPAND) {
        queries = await expandQuery(baseQuery, EXPANSIONS);
      }

      // 3️⃣ Retrieve and combine results from all query variants
      let retrieved = [];
      for (const q of queries) {
        const hits = await similaritySearch(q, topK);
        retrieved.push(...hits);
      }

      // 4️⃣ Filter early by minScore to reduce array size (performance)
      retrieved = retrieved.filter((r) => r.score >= minScore);

      // 5️⃣ Optional: Rerank chunks with LLM
      if (ENABLE_RERANK) {
        retrieved = await reorderChunksWithLLM(retrieved, queries[0]);
      }

      // 6️⃣ Build context string (you can slice if needed for long docs)
      context = retrieved
        .map(
          (r, i) =>
            `SOURCE(${i + 1}):\n${r.document.slice(0, CONTEXT_SNIPPET_CHARS)}`,
        ) // slice prevents huge context
        .join("\n\n");

      // 7️⃣ Build prompt
      prompt = `
CONTEXT:
${context}

Question: ${question}

#
IMPORTANT:
- Only use values clearly tied to entities
- Do not assume or infer missing numbers 

ANSWER:
`;
    } else {
      // console.log("query", question);
      // 1. Retrieve
      results = await similaritySearch(question, topK);
      // console.log("results", results);

      // 2. Build simple context
      context = results
        .map((r, i) => `SOURCE(${i + 1}):\n${r.document}`) //why slice

        // .map((r, i) => `(${i + 1}) ${r.document.slice(0, 300)}`) //why slice
        .join("\n\n");

      // console.log("context", context);

      prompt = `

CONTEXT:
${context}

Question: ${question}


#
IMPORTANT:
- Only use values clearly tied to entities
- Do not assume or infer missing numbers 

ANSWER:

`;
    }

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ];

    // 3. Ask LLM
    const response = await axios.post(`${OLLAMA_API_URL}/api/chat`, {
      model: MODEL_NAME,
      stream: false,
      messages: messages,
      options: {
        temperature,
        num_predict: maxTokens,
      },
    });

    const answer = response.data?.message?.content?.trim() || "";
    console.log("model anserr", answer);

    return {
      type: "text",
      message: answer,
      contextUsed: results,
    };
  },
};

/* ================= UTILS ================= */

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;

  let dot = 0,
    normA = 0,
    normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function loadBase() {
  if (baseLoaded) return;
  // console.log("Loading knowledge base...");

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

function isAggregationQuery(q) {
  return (
    q.toLowerCase().includes("total") ||
    q.toLowerCase().includes("sum") ||
    q.toLowerCase().includes("combined")
  );
}

async function rewriteQuery(query) {
  try {
    const res = await axios.post(`${OLLAMA_API_URL}/api/chat`, {
      model: MODEL_NAME,
      stream: false,
      messages: [
        {
          role: "system",
          content:
            "Rewrite questions concisely; no new facts; respond with plain text only.",
        },
        {
          role: "user",
          content: `Rewrite the question to be clear, specific, and unambiguous while keeping meaning identical. Do NOT add or infer any new facts. Reply with the rewritten question only. Question: ${query}`,
        },
      ],
      options: { temperature: 0.1, num_predict: 64 },
      timeout: 5000,
    });
    let rewritten = res.data?.message?.content || "";
    rewritten = rewritten
      .replace(/```/g, "")
      .replace(/^['"]|['"]$/g, "")
      .trim();
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
        {
          role: "system",
          content:
            "You generate alternative phrasings; no new facts; respond with JSON array.",
        },
        {
          role: "user",
          content: `Generate ${variants} alternative phrasings for this question. Keep meaning identical; do NOT add or assume new facts. Return a JSON array of strings. Question: ${rewritten}`,
        },
      ],
      options: { temperature: 0.1, num_predict: 200 },
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
const RETRIEVE_TOPK = Number(process.env.RETRIEVE_TOPK || 3);
const RERANK_TOPK = Number(process.env.RERANK_TOPK || RETRIEVE_TOPK);

const CONTEXT_SNIPPET_CHARS = Number(process.env.CONTEXT_SNIPPET_CHARS || 200);
/**
 * Reorder retrieved context chunks using LLM relevance scoring
 * @param {Array} chunks - Array of {id, document, score, headline, summary, metadata}
 * @param {string} query - The original user query
 * @returns {Array} - Reordered chunks (most relevant first)
 */
export async function reorderChunksWithLLM(chunks, query) {
  if (!ENABLE_RERANK || !chunks || chunks.length < 2) return chunks;

  // 1. Build a listing string for LLM
  const listing = chunks
    .map(
      (c, i) =>
        `Chunk ${i + 1} | id=${c.id} | score=${c.score?.toFixed(3) || 0}\n` +
        `Headline: ${c.headline || "N/A"}\n` +
        `Summary/snippet: ${c.summary || c.document.slice(0, 200)}`,
    )
    .join("\n\n");

  // 2. Construct LLM prompt
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
        {
          role: "user",
          content: prompt,
        },
      ],
      options: { temperature: 0.1, num_predict: 200 },
      timeout: 12000,
    });

    let content = res.data?.message?.content?.trim() || "";

    // Remove markdown or extra characters
    content = content
      .replace(/```json/i, "")
      .replace(/```/g, "")
      .trim();
    const start = content.indexOf("[");
    const end = content.lastIndexOf("]");
    if (start !== -1 && end !== -1 && end > start)
      content = content.slice(start, end + 1);
    content = content
      .replace(/'/g, '"')
      .replace(/,\s*\]/g, "]")
      .replace(/[\u0000-\u001F]+/g, " ");

    let ids;
    try {
      ids = JSON.parse(content);
    } catch (e) {
      // fallback: extract quoted strings if JSON parse fails
      const matches = Array.from(content.matchAll(/"([^"]+)"/g)).map(
        (m) => m[1],
      );
      if (matches.length) ids = matches;
      else throw e;
    }

    if (!Array.isArray(ids))
      throw new Error("Parsed reorder result is not array");

    // 3. Map back to original chunks
    const byId = Object.fromEntries(chunks.map((c) => [c.id, c]));
    const reordered = ids.map((id) => byId[id]).filter(Boolean);
    const remaining = chunks.filter((c) => !reordered.includes(c));

    // Return top K only
    return [...reordered, ...remaining].slice(0, RERANK_TOPK);
  } catch (err) {
    console.warn(
      "Chunk rerank via LLM failed, keeping original order:",
      err.message,
    );
    return chunks;
  }
}

// import { getCollection } from "../db/chromaClient.js";
// import { embedTexts } from "./embed.js";

// async function similaritySearchChroma(query, topK) {
//   const collection = await getCollection();
//   const [queryEmbedding] = await embedTexts([query]);

//   const results = await collection.query({
//     queryEmbeddings: [queryEmbedding],
//     nResults: topK,
//   });

//   return results.ids[0].map((id, i) => ({
//     id,
//     document: results.documents[0][i],
//     metadata: results.metadatas[0][i],
//     score: 1 - (results.distances?.[0]?.[i] || 0), // convert distance → similarity
//   }));
// }

export default modifiedRAGService;
