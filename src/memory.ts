// What the agent knows.
//
// Every fact your agent picked up during the quest is in `memory.seed.json`, and `npm run
// setup` embeds each one and writes it here. Adding to the pile is the cheapest way to make
// this agent yours: `remember()` takes a sentence and it is retrievable immediately.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { embed } from './embed.js';
import { memories, type MemoryDoc } from './db.js';

export interface SeedItem {
  key: string;
  fact: string;
  ts: string;
}

export function readSeed(): SeedItem[] {
  const path = fileURLToPath(new URL('../memory.seed.json', import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8')) as SeedItem[];
}

/**
 * Store one fact, embedded and ready to retrieve.
 *
 * The vector goes to `config.mongo.vectorPath` — a dotted key, computed rather than
 * written — because that is the path your vector index covers. Storing it at `embedding`
 * instead would succeed, cost you a Voyage call, and be unfindable forever.
 */
export async function remember(key: string, fact: string): Promise<void> {
  const collection = await memories();
  const embedding = await embed(fact, 'document');
  await collection.updateOne(
    { key },
    { $set: { key, fact, ts: new Date().toISOString(), [config.mongo.vectorPath]: embedding } },
    { upsert: true }
  );
}

/**
 * Load the seed file into the collection.
 *
 * Upserts by `key` rather than inserting, so running setup twice is harmless — and
 * re-running it is exactly what you do after changing the embedding model or dimensions,
 * when every stored vector needs regenerating anyway.
 */
export async function seedMemories(log: (msg: string) => void = () => {}): Promise<number> {
  const seed = readSeed();
  for (const [i, item] of seed.entries()) {
    log(`  [${i + 1}/${seed.length}] ${item.key}`);
    await remember(item.key, item.fact);
  }
  return seed.length;
}

/**
 * Your memories only — not the quest corpus sharing the collection with them. The filter is
 * the discriminator: a corpus document has no `key`/`fact` pair.
 */
export async function allMemories(): Promise<MemoryDoc[]> {
  return (await memories())
    .find<MemoryDoc>(
      { key: { $exists: true }, fact: { $exists: true } },
      { projection: { _id: 0, key: 1, fact: 1, ts: 1 } }
    )
    .toArray();
}
