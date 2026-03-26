import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// const DEFAULT_TEST_FILE = path.join(__dirname, "tests.jsonl");
const DEFAULT_TEST_FILE = path.join(__dirname, "test.jsonl");
// const DEFAULT_TEST_FILE = path.join(__dirname, "tester.jsonl");



/**
 * @typedef {Object} TestQuestion
 * @property {string} question - The question to ask the RAG system.
 * @property {string[]} keywords - Keywords that should appear in retrieved context.
 * @property {string} reference_answer - The reference answer for evaluation.
 * @property {string} category - Question category (e.g., direct_fact, spanning, temporal).
 */

/**
 * Load test questions from a JSONL file.
 * @param {string} [filePath=DEFAULT_TEST_FILE]
 * @returns {TestQuestion[]}
 */
export function loadTests(filePath = DEFAULT_TEST_FILE) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.split(/\r?\n/).filter(Boolean);

  return lines.map((line) => {
    const data = JSON.parse(line);
    return {
      question: data.question,
      keywords: data.keywords ?? [],
      reference_answer: data.reference_answer ?? "",
      category: data.category ?? "unknown",
    };
  });
}

export { DEFAULT_TEST_FILE };
