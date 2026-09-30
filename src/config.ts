// Everything this agent needs to know about itself, in one place.
//
// The half that describes *you* — your agent's name, its prompt, which collection and
// vector index it reads, how wide its embeddings are — lives in `agent.config.json` at the
// repo root, not in this file. That file was generated from the work you actually did
// during the quest, which is why the numbers in it match the cluster you built.
//
// The half that is secret — connection string, API keys — comes from the environment and
// is never written to disk by anything here. Copy `.env.example` to `.env` and fill it in.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface AgentConfigFile {
  agent: { name: string; face: string; model: string };
  systemPrompt: string;
  customInstructions: string;
  skills: string[];
  database: { dbName: string; collection: string; indexName: string; vectorPath: string };
  embedding: { model: string; dimensions: number };
  player: { codename: string; questsCompleted: number; score: number };
}

const configPath = fileURLToPath(new URL('../agent.config.json', import.meta.url));
const file = JSON.parse(readFileSync(configPath, 'utf8')) as AgentConfigFile;

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env and fill it in — see the README for where each value comes from.`
    );
  }
  return value;
}

export const config = {
  agent: file.agent,
  systemPrompt: file.systemPrompt,
  customInstructions: file.customInstructions,
  skills: file.skills,
  player: file.player,

  mongo: {
    // Your own cluster. If you played as a Trailblazer the one you built during the event
    // has expired by now — create a free cluster at https://mongodb.com/atlas and point
    // this at it, then run `npm run setup` to rebuild the collection and index.
    uri: required('MONGODB_URI'),
    dbName: process.env.DB_NAME ?? file.database.dbName,
    // The collection you indexed during the quest, not a private one. If you point this at
    // the cluster you claimed, your agent's memories land beside the corpus you already
    // built and the index you already created serves both.
    collection: file.database.collection,
    indexName: file.database.indexName,
    // Where in a document the vector lives. Not `embedding` by default, because the quest
    // corpus keeps its vectors at `search.embeddings` and one index covers one path — a
    // memory stored anywhere else is invisible to $vectorSearch.
    vectorPath: file.database.vectorPath,
  },

  embedding: {
    apiKey: required('VOYAGE_API_KEY'),
    model: file.embedding.model,
    // Not a constant anywhere in this project, and deliberately so: the width has to match
    // the vector index on your cluster exactly, or $vectorSearch fails with an error that
    // does not mention dimensions. Change it here and re-run `npm run setup`.
    dimensions: file.embedding.dimensions,
  },

  llm: {
    // Any OpenAI-compatible chat-completions endpoint. Defaults to OpenAI; point it at
    // Ollama (http://localhost:11434/v1) or anything else that speaks the same shape.
    baseUrl: process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
    // Optional on purpose. Without it the agent still runs and still retrieves — it just
    // shows you what it found instead of writing prose about it, so a fresh clone does
    // something useful before you have signed up for anything.
    apiKey: process.env.LLM_API_KEY,
    model: process.env.LLM_MODEL ?? file.agent.model,
  },
} as const;
