import "dotenv/config";
import process from "process";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import fs from "fs";
import { loadTests } from "./test.js";

import { LangService } from "../src/services/LangService.js";
import { ImpRAGService } from "../src/services/ImpRAGService.js";

const MODEL = process.env.MODEL_NAME || "qwen2.5:3b";
const JUDGE_MODEL = process.env.JUDGE_MODEL || MODEL;
const OLLAMA_API_URL = process.env.OLLAMA_API_URL || "http://localhost:11434";
const RESULTS_JSON = path.join(path.dirname(fileURLToPath(import.meta.url)), "results.json");
const RESULTS_HTML = path.join(path.dirname(fileURLToPath(import.meta.url)), "results.html");

// Helper to normalize document content regardless of shape
const docText = (doc = {}) =>
  doc.pageContent ??
  doc.page_content ??
  doc.content ??
  doc.document ??
  "";

async function callOllamaChat(messages, { model = JUDGE_MODEL, temperature = 0 } = {}) {
  const res = await axios.post(`${OLLAMA_API_URL}/api/chat`, {
    model,
    messages,
    stream: false,
    options: { temperature },
  });
  return res.data?.message?.content ?? "";
}

function calculateMRR(keyword, retrievedDocs) {
  const keywordLower = keyword.toLowerCase();
  for (let i = 0; i < retrievedDocs.length; i += 1) {
    if (docText(retrievedDocs[i]).toLowerCase().includes(keywordLower)) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

function calculateDCG(relevances, k) {
  let dcg = 0;
  for (let i = 0; i < Math.min(k, relevances.length); i += 1) {
    dcg += relevances[i] / Math.log2(i + 2); // rank starts at 1
  }
  return dcg;
}

function calculateNDCG(keyword, retrievedDocs, k = 10) {
  const keywordLower = keyword.toLowerCase();
  const relevances = retrievedDocs.slice(0, k).map((doc) =>
    docText(doc).toLowerCase().includes(keywordLower) ? 1 : 0,
  );
  const dcg = calculateDCG(relevances, k);
  const ideal = [...relevances].sort((a, b) => b - a);
  const idcg = calculateDCG(ideal, k);
  return idcg > 0 ? dcg / idcg : 0;
}

async function fetchContext(question, topK = 10) {
  if (typeof ImpRAGService.loadBase === "function") {
    await ImpRAGService.loadBase();
  }
  // Use LangService retrieval; keeps behavior close to runtime system.
  const { contextUsed = [] } = await ImpRAGService.generateResponse(
    question,
    undefined,
    { topK, maxTokens: 1, temperature: 0.0 },
  );
  return contextUsed;
}

async function answerQuestion(question) {
  const { message, contextUsed = [] } = await ImpRAGService.generateResponse(
    question,
    undefined,
    { temperature: 0.0, topK: 5 },
  );
  return { generatedAnswer: message, retrievedDocs: contextUsed };
}

async function evaluateRetrieval(test, k = 5) {
  const retrievedDocs = await fetchContext(test.question, k);

  const mrrScores = test.keywords.map((kw) => calculateMRR(kw, retrievedDocs));
  const avgMRR = mrrScores.length
    ? mrrScores.reduce((a, b) => a + b, 0) / mrrScores.length
    : 0;

  const ndcgScores = test.keywords.map((kw) =>
    calculateNDCG(kw, retrievedDocs, k),
  );
  const avgNDCG = ndcgScores.length
    ? ndcgScores.reduce((a, b) => a + b, 0) / ndcgScores.length
    : 0;

  const keywordsFound = mrrScores.filter((score) => score > 0).length;
  const totalKeywords = test.keywords.length;
  const keywordCoverage =
    totalKeywords > 0 ? (keywordsFound / totalKeywords) * 100 : 0;

  return {
    mrr: avgMRR,
    ndcg: avgNDCG,
    keywords_found: keywordsFound,
    total_keywords: totalKeywords,
    keyword_coverage: keywordCoverage,
    retrievedDocs,
  };
}

async function evaluateAnswer(test) {
  const { generatedAnswer, retrievedDocs } = await answerQuestion(test.question);

  const judgeMessages = [
    {
      role: "system",
      content:
        "You are an expert evaluator assessing the quality of answers  and are very strict. Compare the generated answer to the reference answer and only give 5/5 for perfect answers. Reply in JSON with keys: feedback, accuracy, completeness, relevance.",
    },
    {
      role: "user",
      content: `Question:
${test.question}

Generated Answer:
${generatedAnswer}

Reference Answer:
${test.reference_answer}

Scoring:
1) Accuracy: 1 (wrong) to 5 (perfectly accurate).
2) Completeness: 1 (missing key info) to 5 (all info included).
3) Relevance: 1 (off-topic) to 5 (direct and nothing extra).`,
    },
  ];

  const res = await callOllamaChat(judgeMessages, { model: JUDGE_MODEL, temperature: 0 });
  let parsed;
  try {
    parsed = JSON.parse(res);
  } catch (err) {
    parsed = {
      feedback: res,
      accuracy: 0,
      completeness: 0,
      relevance: 0,
    };
  }
  // Normalize numeric fields to avoid NaN
  parsed = {
    feedback: parsed.feedback ?? res,
    accuracy: Number(parsed.accuracy ?? 0) || 0,
    completeness: Number(parsed.completeness ?? 0) || 0,
    relevance: Number(parsed.relevance ?? 0) || 0,
  };

  return {
    answer_eval: parsed,
    generated_answer: generatedAnswer,
    retrieved_docs: retrievedDocs,
  };
}

async function* evaluateAllRetrieval() {
  const tests = loadTests();
  const total = tests.length;
  for (let i = 0; i < total; i += 1) {
    const result = await evaluateRetrieval(tests[i]);
    yield { test: tests[i], result, progress: (i + 1) / total };
  }
}

async function* evaluateAllAnswers() {
  const tests = loadTests();
  const total = tests.length;
  for (let i = 0; i < total; i += 1) {
    const result = await evaluateAnswer(tests[i]);
    yield { test: tests[i], result, progress: (i + 1) / total };
  }
}

function computeSummary(results) {
  if (!results.length) {
    return {
      total: 0,
      avg_mrr: 0,
      avg_ndcg: 0,
      avg_keyword_coverage: 0,
      avg_accuracy: 0,
      avg_completeness: 0,
      avg_relevance: 0,
      categories: {},
    };
  }

  const sumPath = (arr, path) =>
    arr.reduce((acc, r) => {
      const parts = path.split(".");
      let val = r;
      for (const p of parts) val = val?.[p];
      return acc + Number(val ?? 0);
    }, 0);

  const summary = {
    total: results.length,
    avg_mrr: sumPath(results, "retrieval.mrr") / results.length,
    avg_ndcg: sumPath(results, "retrieval.ndcg") / results.length,
    avg_keyword_coverage: sumPath(results, "retrieval.keyword_coverage") / results.length,
    avg_accuracy: sumPath(results, "answer_eval.accuracy") / results.length,
    avg_completeness: sumPath(results, "answer_eval.completeness") / results.length,
    avg_relevance: sumPath(results, "answer_eval.relevance") / results.length,
    categories: {},
  };

  for (const r of results) {
    const cat = r.category || "unknown";
    if (!summary.categories[cat]) {
      summary.categories[cat] = {
        count: 0,
        mrr: 0,
        ndcg: 0,
        coverage: 0,
        accuracy: 0,
        completeness: 0,
        relevance: 0,
      };
    }
    const c = summary.categories[cat];
    c.count += 1;
    c.mrr += r.retrieval.mrr || 0;
    c.ndcg += r.retrieval.ndcg || 0;
    c.coverage += r.retrieval.keyword_coverage || 0;
    c.accuracy += Number(r.answer_eval.accuracy || 0);
    c.completeness += Number(r.answer_eval.completeness || 0);
    c.relevance += Number(r.answer_eval.relevance || 0);
  }

  for (const key of Object.keys(summary.categories)) {
    const c = summary.categories[key];
    const n = c.count || 1;
    c.mrr /= n;
    c.ndcg /= n;
    c.coverage /= n;
    c.accuracy /= n;
    c.completeness /= n;
    c.relevance /= n;
  }

  return summary;
}

async function runAllAndSave() {
  const tests = loadTests();
  const results = [];
  for (let i = 0; i < tests.length; i += 1) {
    const test = tests[i];
    const retrieval = await evaluateRetrieval(test);
    const answer = await evaluateAnswer(test);
    results.push({
      index: i,
      question: test.question,
      category: test.category,
      keywords: test.keywords,
      reference_answer: test.reference_answer,
      generated_answer: answer.generated_answer,
      retrieval: {
        mrr: retrieval.mrr,
        ndcg: retrieval.ndcg,
        keywords_found: retrieval.keywords_found,
        total_keywords: retrieval.total_keywords,
        keyword_coverage: retrieval.keyword_coverage,
      },
      answer_eval: answer.answer_eval,
    });
    console.log(
      `Finished test ${i + 1}/${tests.length} | MRR=${retrieval.mrr.toFixed(
        3,
      )} nDCG=${retrieval.ndcg.toFixed(3)} Acc=${Number(
        answer.answer_eval.accuracy,
      ).toFixed(2)}`,
    );
  }

  const summary = computeSummary(results);

  fs.writeFileSync(
    RESULTS_JSON,
    JSON.stringify({ summary, results }, null, 2),
    "utf-8",
  );

  const html = buildResultsHtml(results, summary);
  fs.writeFileSync(RESULTS_HTML, html, "utf-8");

  console.log(`\nSaved JSON: ${RESULTS_JSON}`);
  console.log(`Saved HTML: ${RESULTS_HTML}`);
  console.log(
    `Averages -> MRR ${summary.avg_mrr.toFixed(3)}, nDCG ${summary.avg_ndcg.toFixed(
      3,
    )}, Coverage ${summary.avg_keyword_coverage.toFixed(1)}%, Acc ${summary.avg_accuracy.toFixed(
      2,
    )}, Compl ${summary.avg_completeness.toFixed(2)}, Rel ${summary.avg_relevance.toFixed(2)}`,
  );
}

async function runCliEvaluation(testNumber) {
  const tests = loadTests();
  if (testNumber < 0 || testNumber >= tests.length) {
    console.error(`Error: test_row_number must be between 0 and ${tests.length - 1}`);
    process.exit(1);
  }

  const test = tests[testNumber];
  console.log("\n" + "=".repeat(80));
  console.log(`Test #${testNumber}`);
  console.log("=".repeat(80));
  console.log(`Question: ${test.question}`);
  console.log(`Keywords: ${test.keywords}`);
  console.log(`Category: ${test.category}`);
  console.log(`Reference Answer: ${test.reference_answer}`);

  console.log("\n" + "=".repeat(80));
  console.log("Retrieval Evaluation");
  console.log("=".repeat(80));
  const retrieval = await evaluateRetrieval(test);
  console.log(`MRR: ${retrieval.mrr.toFixed(4)}`);
  console.log(`nDCG: ${retrieval.ndcg.toFixed(4)}`);
  console.log(
    `Keywords Found: ${retrieval.keywords_found}/${retrieval.total_keywords}`,
  );
  console.log(`Keyword Coverage: ${retrieval.keyword_coverage.toFixed(1)}%`);

  console.log("\n" + "=".repeat(80));
  console.log("Answer Evaluation");
  console.log("=".repeat(80));
  const answer = await evaluateAnswer(test);
  console.log(`\nGenerated Answer:\n${answer.generated_answer}`);
  console.log(`\nFeedback:\n${answer.answer_eval.feedback}`);
  console.log("\nScores:");
  console.log(`  Accuracy: ${Number(answer.answer_eval.accuracy).toFixed(2)}/5`);
  console.log(
    `  Completeness: ${Number(answer.answer_eval.completeness).toFixed(2)}/5`,
  );
  console.log(`  Relevance: ${Number(answer.answer_eval.relevance).toFixed(2)}/5`);
  console.log("\n" + "=".repeat(80) + "\n");
}

function buildResultsHtml(results, summary) {
  const json = JSON.stringify(results);
  const summaryJson = JSON.stringify(summary);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>RAG Evaluation Results</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <style>
    body { font-family: sans-serif; margin: 24px; }
    h1 { margin-top: 0; }
    .chart-row { display: flex; flex-wrap: wrap; gap: 24px; }
    canvas { max-width: 520px; }
    table { border-collapse: collapse; width: 100%; margin-top: 24px; }
    th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; }
    th { background: #f5f5f5; }
    tr:nth-child(every) { background: #fafafa; }
  </style>
</head>
<body>
  <h1>RAG Evaluation Results</h1>
  <p>Tests: ${results.length}</p>
  <div>
    <h3>Aggregate Averages</h3>
    <ul>
      <li>MRR: ${summary.avg_mrr.toFixed(3)}</li>
      <li>nDCG: ${summary.avg_ndcg.toFixed(3)}</li>
      <li>Keyword Coverage: ${summary.avg_keyword_coverage.toFixed(1)}%</li>
      <li>Accuracy: ${summary.avg_accuracy.toFixed(2)}</li>
      <li>Completeness: ${summary.avg_completeness.toFixed(2)}</li>
      <li>Relevance: ${summary.avg_relevance.toFixed(2)}</li>
    </ul>
  </div>
  <div class="chart-row">
    <div>
      <h3>Answer Scores</h3>
      <canvas id="answerChart"></canvas>
    </div>
    <div>
      <h3>Retrieval (MRR / nDCG)</h3>
      <canvas id="retrievalChart"></canvas>
    </div>
  </div>
  <h3>Details</h3>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Category</th>
        <th>Question</th>
        <th>MRR</th>
        <th>nDCG</th>
        <th>Keywords Found</th>
        <th>Total Keywords</th>
        <th>Coverage %</th>
        <th>Accuracy</th>
        <th>Completeness</th>
        <th>Relevance</th>
      </tr>
    </thead>
    <tbody id="rows"></tbody>
  </table>
  <script>
    const results = ${json};
    const summary = ${summaryJson};
    const labels = results.map(r => r.index.toString());
    const accuracy = results.map(r => Number(r.answer_eval.accuracy || 0));
    const completeness = results.map(r => Number(r.answer_eval.completeness || 0));
    const relevance = results.map(r => Number(r.answer_eval.relevance || 0));
    const mrr = results.map(r => Number(r.retrieval.mrr || 0));
    const ndcg = results.map(r => Number(r.retrieval.ndcg || 0));

    new Chart(document.getElementById('answerChart'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Accuracy', data: accuracy, backgroundColor: '#4f46e5' },
          { label: 'Completeness', data: completeness, backgroundColor: '#f59e0b' },
          { label: 'Relevance', data: relevance, backgroundColor: '#10b981' },
        ],
      },
      options: { responsive: true, scales: { y: { min: 0, max: 5 } } },
    });

    new Chart(document.getElementById('retrievalChart'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'MRR', data: mrr, backgroundColor: '#2563eb' },
          { label: 'nDCG', data: ndcg, backgroundColor: '#14b8a6' },
        ],
      },
      options: { responsive: true, scales: { y: { min: 0, max: 1 } } },
    });

    const rows = document.getElementById('rows');
    results.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = [
        r.index,
        r.category,
        r.question,
        (r.retrieval.mrr ?? 0).toFixed(3),
        (r.retrieval.ndcg ?? 0).toFixed(3),
        \`\${r.retrieval.keywords_found ?? 0}\`,
        \`\${r.retrieval.total_keywords ?? 0}\`,
        (r.retrieval.keyword_coverage ?? 0).toFixed(1),
        (r.answer_eval.accuracy ?? 0).toFixed(2),
        (r.answer_eval.completeness ?? 0).toFixed(2),
        (r.answer_eval.relevance ?? 0).toFixed(2),
      ].map(v => '<td>' + v + '</td>').join('');
      rows.appendChild(tr);
    });
  </script>
</body>
</html>`;
}

async function main() {
  if (process.argv.length !== 3) {
    console.error(
      "Usage: node server/evaluation/eval.js <test_row_number | all>",
    );
    process.exit(1);
  }

  const arg = process.argv[2];
  if (arg === "all" || arg === "--all") {
    await runAllAndSave();
    return;
  }

  const testNumber = Number(arg);
  if (Number.isNaN(testNumber)) {
    console.error("Error: test_row_number must be an integer");
    process.exit(1);
  }
  await runCliEvaluation(testNumber);
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}

export {
  calculateMRR,
  calculateNDCG,
  evaluateRetrieval,
  evaluateAnswer,
  evaluateAllRetrieval,
  evaluateAllAnswers,
  runCliEvaluation,
  runAllAndSave,
  fetchContext,
  answerQuestion,
  MODEL,
  JUDGE_MODEL,
};
