import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { chatService } from "./chatService.js";
import dbPromise from "../db/database.js";

const OLLAMA_API_URL = process.env.OLLAMA_API_URL || "http://localhost:11434";
const MODEL_NAME = process.env.MODEL_NAME || "qwen2.5:3b";

// TOOLS USAGE (system prompt baseline, now chat-only)
const DEFAULT_SYSTEM_PROMPT = `
You reprsent an insurance company
you answer questions about the employees and products.
you will be provided with additional context relavent to the users question.
give brief answers to the users question.
if you dont know say so.
relavent content:
`;

const knowledgeBase = {};
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EMPLOYEES_DIR = path.resolve(
  __dirname,
  "../data/knowledge-base/employees",
);
const CONTRACTS_DIR = path.resolve(
  __dirname,
  "../data/knowledge-base/contracts",
);
const PRODUCTS_DIR = path.resolve(__dirname, "../data/knowledge-base/products");
const COMPANIES_DIR = path.resolve(__dirname, "../data/knowledge-base/company");

async function loadMarkdownCategory(dirPath) {
  const files = await fs.readdir(dirPath);
  const mdFiles = files.filter((f) => f.toLowerCase().endsWith(".md"));
  const entries = await Promise.all(
    mdFiles.map(async (file) => {
      const fullPath = path.join(dirPath, file);
      const content = await fs.readFile(fullPath, "utf-8");
      const base = path.basename(file, path.extname(file)).toLowerCase();
      return [base, content];
    }),
  );
  return Object.fromEntries(entries);
}

async function loadBase() {
  if (Object.keys(knowledgeBase).length !== 0) return knowledgeBase;
  try {
    const [employees, products] = await Promise.all([
      loadMarkdownCategory(EMPLOYEES_DIR),
      loadMarkdownCategory(PRODUCTS_DIR),
    ]);

    // Flatten all docs into a single map (no nested category keys)
    Object.assign(knowledgeBase, employees, products);

    return knowledgeBase;
  } catch (err) {
    console.error("Failed to load knowledge base:", err);
    throw err;
  }
}

export const RagService = {
  loadBase,
  generateResponse: async (
    message,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    options = {},
  ) => {
    try {
      // console.log("knowledgeBase", knowledgeBase);
      const { temperature = 0.3, maxTokens = 500, topP = 0.9 } = options;

      await chatService.saveMessage("user", message);

      const systemMessage = systemPrompt;
      const messages = [];
      const contextData = additionalContext(message);
      let totalContext = `${DEFAULT_SYSTEM_PROMPT} ${contextData}`;

      // console.log("totalContext", totalContext);
      messages.push({ role: "user", content: totalContext });

      // console.log(messages, "messages");

      messages.push({ role: "user", content: message });

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
      };
    } catch (error) {
      console.error("Error calling Ollama:", error.message);
      throw new Error(`Failed to get response from Ollama: ${error.message}`);
    }
  },
};

function getRelaventContext(msg) {
  if (!msg) return [];
  const words = msg.trim().toLowerCase().split(/\s+/).filter(Boolean);

  const tokens = new Set(words);
  const relevant = [];

  for (const [key, doc] of Object.entries(knowledgeBase)) {
    const keyTokens = key.split(/\s+/).filter(Boolean);
    const match = keyTokens.every((kt) => tokens.has(kt));
    if (match) relevant.push(doc);
  }
  // console.log("relevantContext", relevant);
  return relevant;
}

function additionalContext(msg) {
  const relCon = getRelaventContext(msg);
  if (relCon.length === 0) {
    return "there is no additional context for this question";
  }
  const result = relCon.join("\n");
  // console.log("result", result);
  return result;
}
