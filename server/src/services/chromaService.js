import { ChromaClient } from "chromadb";

const CHROMA_URL = process.env.CHROMA_URL || "http://localhost:8000";
const COLLECTION_NAME =
  process.env.CHROMA_COLLECTION || "insurance-knowledge-base";

let client;
let collectionPromise;

function getClient() {
  if (!client) {
    client = new ChromaClient({ path: CHROMA_URL });
  }
  return client;
}

async function getCollection() {
  if (!collectionPromise) {
    collectionPromise = getClient().getOrCreateCollection({
      name: COLLECTION_NAME,
      metadata: { description: "Insurance KB documents" },
    });
  }
  return collectionPromise;
}

export async function upsertDocuments(items) {
  const collection = await getCollection();
  const ids = items.map((i) => i.id);
  const documents = items.map((i) => i.document);
  const metadatas = items.map((i) => i.metadata ?? {});

  // idempotent upsert; chroma will overwrite by id
  await collection.upsert({ ids, documents, metadatas });
}

export async function similaritySearch(query, topK = 3) {
  const collection = await getCollection();
  const results = await collection.query({
    queryTexts: [query],
    nResults: topK,
  });

  const docs = results.documents?.[0] ?? [];
  const metas = results.metadatas?.[0] ?? [];
  const ids = results.ids?.[0] ?? [];

  return docs.map((doc, idx) => ({
    id: ids[idx],
    document: doc,
    metadata: metas[idx],
  }));
}

export async function resetCollection() {
  const clientInstance = getClient();
  await clientInstance.deleteCollection({ name: COLLECTION_NAME });
  collectionPromise = undefined;
}
