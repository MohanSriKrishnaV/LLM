let client;

import { loadBase } from "../services/LangService.js";
export async function connectMongo() {
  if (client) return client;

  let MongoClient;
  try {
    ({ MongoClient } = await import("mongodb"));
  } catch (err) {
    console.warn(
      "MongoDB client not installed. Run `npm install mongodb` when network access is available.",
    );
    return null;
  }

  const uri = process.env.MONGODB_URI ||"mongodb+srv://125029:Kf5qxBTmqkoULUBH@cluster0.7cffpm8.mongodb.net/?appName=Cluster0" ;
  const dbName = process.env.MONGODB_DB || "LLM";

  if (!uri || !dbName) {
    console.warn("MONGODB_URI or MONGODB_DB not set; skipping Mongo connection.");
    return null;
  }

  client = new MongoClient(uri, { maxPoolSize: 10 });
  await client.connect();

  console.log("Connected to MongoDB:", uri);
  // await loadBase(); //loading chunk files of insurance db
  return client;
}

export function getMongoDb() {
  if (!client) return null;
  const dbName = process.env.MONGODB_DB || "LLM";
  return dbName ? client.db(dbName) : null;
}

export async function closeMongo() {
  if (client) {
    await client.close();
    client = undefined;
  }
}
