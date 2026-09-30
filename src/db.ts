// One client, shared. Opening a MongoClient per call is the mistake that makes a small
// agent feel slow — the driver pools connections for you, but only if you let it keep the
// client around.

import { MongoClient, type Collection, type Db, type Document } from 'mongodb';
import { config } from './config.js';

/**
 * A memory, as this agent stores one.
 *
 * The vector is deliberately not a field here: it lives at `config.mongo.vectorPath`, which
 * is read from `agent.config.json` rather than fixed, so it cannot be typed as a property
 * name. See `remember()`.
 */
export interface MemoryDoc {
  key: string;
  fact: string;
  ts: string;
}

let client: MongoClient | undefined;

export async function getDb(): Promise<Db> {
  if (!client) {
    client = new MongoClient(config.mongo.uri);
    await client.connect();
  }
  return client.db(config.mongo.dbName);
}

/**
 * Typed as `Document`, not `MemoryDoc`, and that is honest rather than lazy: this is the
 * collection you built during the quest, so it holds the corpus documents as well as your
 * agent's memories. Both are indexed by the same vector index, and a search returns a mix.
 */
export async function memories(): Promise<Collection<Document>> {
  return (await getDb()).collection(config.mongo.collection);
}

export async function closeDb(): Promise<void> {
  await client?.close();
  client = undefined;
}
