// Rebuild this agent's cluster state from scratch.
//
//   npm run setup
//
// Idempotent: run it as often as you like. It creates the collection if it is missing,
// creates the vector index if it is missing, waits for the index to become queryable, and
// embeds every fact in memory.seed.json.
//
// This is the script to run after you change the embedding model or its dimensions — both
// invalidate every vector already stored, and the index has to be rebuilt to match.

import { config } from '../src/config.js';
import { getDb, closeDb } from '../src/db.js';
import { seedMemories } from '../src/memory.js';

const { collection: collectionName, indexName, vectorPath, dbName } = config.mongo;

async function ensureCollection(): Promise<void> {
  const db = await getDb();
  const existing = await db.listCollections({ name: collectionName }).toArray();
  if (existing.length) {
    console.log(`✓ collection ${dbName}.${collectionName} already exists`);
    return;
  }
  await db.createCollection(collectionName);
  console.log(`✓ created collection ${dbName}.${collectionName}`);
}

async function ensureVectorIndex(): Promise<void> {
  const db = await getDb();
  const collection = db.collection(collectionName);

  const existing = await collection.listSearchIndexes().toArray();
  const match = existing.find((i) => i.name === indexName);
  if (match) {
    // Almost always the index *you* built during the quest, still standing on the cluster
    // you claimed. Left exactly as it is: it already covers `vectorPath`, so your agent's
    // memories become searchable the moment they are written.
    console.log(`✓ vector index "${indexName}" already exists`);
    return;
  }

  await collection.createSearchIndex({
    name: indexName,
    type: 'vectorSearch',
    definition: {
      fields: [
        {
          type: 'vector',
          path: vectorPath,
          numDimensions: config.embedding.dimensions,
          // Voyage returns normalized vectors, which makes cosine and dotProduct equivalent
          // here. Cosine is the safer default if you later swap in a model that does not.
          similarity: 'cosine',
        },
      ],
    },
  });
  console.log(`✓ created vector index "${indexName}" on ${vectorPath} (${config.embedding.dimensions} dimensions)`);

  // Atlas builds the index asynchronously. Seeding before it is queryable succeeds, but the
  // first search then returns nothing and looks like a bug in your code rather than a race.
  process.stdout.write('  waiting for it to come online');
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    // The driver types this cursor as `{ name: string }`, but Atlas returns the build state
    // alongside it. `queryable` is the field that flips when the index can actually serve a
    // $vectorSearch — `status: 'READY'` arrives slightly earlier and is not the same promise.
    const [index] = (await collection.listSearchIndexes(indexName).toArray()) as { queryable?: boolean }[];
    if (index?.queryable) {
      console.log(' — ready');
      return;
    }
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log('\n⚠️  still building after 5 minutes. Seeding anyway; searches will work once it finishes.');
}

async function main(): Promise<void> {
  console.log(`\nSetting up ${config.agent.name} on ${dbName}\n`);
  await ensureCollection();
  await ensureVectorIndex();

  console.log('\nEmbedding memories:');
  const count = await seedMemories((msg) => console.log(msg));

  console.log(`\n✓ ${count} ${count === 1 ? 'memory' : 'memories'} stored. Run \`npm start\` to talk to it.\n`);
}

try {
  await main();
} catch (e) {
  console.error(`\n✗ ${(e as Error).message}\n`);
  process.exitCode = 1;
} finally {
  await closeDb();
}
