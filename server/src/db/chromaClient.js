import { ChromaClient } from "chromadb";

const client = new ChromaClient({
  path: "http://localhost:8000", // if running server
  // OR leave empty for in-memory/local
});

export async function getCollection() {
  return await client.getOrCreateCollection({
    name: "rag_collection",
  });
}