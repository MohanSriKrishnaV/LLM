// Quick embedding visualizer (UMAP -> Plotly HTML)
// Usage:
//   1) npm i --save-dev umap-js
//   2) node scripts/embed-viz.js
// Env vars used: MONGODB_URI, MONGODB_DB, KB_COLLECTION (optional)

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { MongoClient } from "mongodb";
import { UMAP } from "umap-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_HTML = path.resolve(__dirname, "../viz/embeddings.html");



const MONGODB_URI = process.env.MONGODB_URI ||'mongodb+srv://125029:Kf5qxBTmqkoULUBH@cluster0.7cffpm8.mongodb.net/?appName=Cluster0';
const MONGODB_DB = process.env.MONGODB_DB || 'LLM';
const KB_COLLECTION = process.env.KB_COLLECTION || "kb_chunks";
const SAMPLE_LIMIT = Number(process.env.VIZ_LIMIT || 2000);
const DIM = Number(process.env.VIZ_DIM || 2); // 2 or 3

if (!MONGODB_URI || !MONGODB_DB) {
  console.error("MONGODB_URI and MONGODB_DB are required.");
  process.exit(1);
}

async function fetchEmbeddings() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const col = client.db(MONGODB_DB).collection(KB_COLLECTION);
  const docs = await col
    .find(
      {},
      { projection: { embedding: 1, metadata: 1, content: 1 }, limit: SAMPLE_LIMIT },
    )
    .toArray();
  await client.close();
  return docs;
}

function buildHtml(points, labels) {
  const is3D = DIM === 3;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const zs = is3D ? points.map((p) => p[2] || 0) : null;

  // Simple color map by label
  const unique = [...new Set(labels)];
  const palette = [
    "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
    "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
  ];
  const colorMap = new Map(
    unique.map((u, i) => [u, palette[i % palette.length]]),
  );
  const colors = labels.map((l) => colorMap.get(l) || "#888");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>KB Embeddings</title>
  <script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
</head>
<body>
  <div id="plot" style="width:100%;height:100vh;"></div>
  <script>
    const xs = ${JSON.stringify(xs)};
    const ys = ${JSON.stringify(ys)};
    const zs = ${is3D ? JSON.stringify(zs) : "null"};
    const labels = ${JSON.stringify(labels)};
    const colors = ${JSON.stringify(colors)};
    const is3D = ${JSON.stringify(is3D)};

    const trace = is3D ? {
      x: xs, y: ys, z: zs,
      mode: "markers",
      type: "scatter3d",
      text: labels,
      marker: { size: 4, opacity: 0.7, color: colors }
    } : {
      x: xs, y: ys,
      mode: "markers",
      type: "scattergl",
      text: labels,
      marker: { size: 6, opacity: 0.7, color: colors }
    };

    const layout = {
      title: "Embedding UMAP (KB)",
      hovermode: "closest",
      showlegend: false,
      scene: is3D ? { xaxis: { title: "x" }, yaxis: { title: "y" }, zaxis: { title: "z" } } : undefined
    };
    Plotly.newPlot("plot", [trace], layout);
  </script>
</body>
</html>`;
}

async function main() {
  const docs = await fetchEmbeddings();
  if (docs.length === 0) {
    console.error("No embeddings found in collection.");
    return;
  }

  const vectors = docs.map((d) => d.embedding);
  const labels = docs.map(
    (d) => d.metadata?.type || d.metadata?.source || "unknown",
  );

  const umap = new UMAP({ nComponents: DIM, nNeighbors: 15, minDist: 0.1 });
  const points = umap.fit(vectors);

  await fs.mkdir(path.dirname(OUT_HTML), { recursive: true });
  await fs.writeFile(OUT_HTML, buildHtml(points, labels), "utf8");
  console.log(`Wrote ${OUT_HTML} with ${points.length} points.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
