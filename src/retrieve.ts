// The retrieval half of retrieval-augmented generation.
//
// This is the $vectorSearch stage you built during the quest, unchanged in shape. It runs
// against your own cluster now.

import { embed } from './embed.js';
import { memories } from './db.js';
import { config } from './config.js';

export interface Hit {
  key: string;
  fact: string;
  score: number;
}

/**
 * `numCandidates` is the knob worth understanding. $vectorSearch does an approximate
 * search: it collects this many near-neighbours and then returns the best `limit` of them.
 * Too low and you miss good matches; too high and you pay for work you throw away. Ten to
 * twenty times `limit` is the usual starting point, and it is a starting point, not a rule.
 */
export async function retrieve(query: string, limit = 5): Promise<Hit[]> {
  const queryVector = await embed(query, 'query');
  const collection = await memories();

  const results = await collection
    .aggregate<Hit>([
      {
        $vectorSearch: {
          index: config.mongo.indexName,
          // Read from config for the same reason `remember()` writes to it: one index covers
          // one path, and this is the one your quest corpus already uses.
          path: config.mongo.vectorPath,
          queryVector,
          numCandidates: limit * 15,
          limit,
        },
      },
      {
        // Two shapes come back from one index. Your agent's memories are `{key, fact}`; the
        // corpus documents you indexed during the quest keep their embedded text at
        // `search.text`. Coalescing rather than filtering is the point — the agent recalls
        // what you told it *and* what it was built on, which is the whole reason it reads
        // this collection instead of a private one.
        $project: {
          _id: 0,
          key: { $ifNull: ['$key', '$id'] },
          fact: { $ifNull: ['$fact', '$search.text'] },
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ])
    .toArray();

  // A corpus document with neither a `fact` nor a `search.text` would project to null and
  // reach the prompt as "undefined". Dropping it is kinder than grounding a model on it.
  return results.filter((h) => typeof h.fact === 'string' && h.fact.length > 0);
}
