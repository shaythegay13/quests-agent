// CLI chat loop.
//
//   npm start                  interactive
//   npm run ask -- "question"  one question, then exit

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { config } from './config.js';
import { ask } from './agent.js';
import { remember } from './memory.js';
import { closeDb } from './db.js';

const { name, face } = config.agent;

async function answer(question: string): Promise<void> {
  try {
    const { text, hits, retrievalOnly } = await ask(question);
    console.log(`\n${face} ${text}\n`);
    if (!retrievalOnly && hits.length) {
      console.log(`   ↳ recalled: ${hits.map((h) => h.key).join(', ')}\n`);
    }
  } catch (e) {
    console.error(`\n⚠️  ${(e as Error).message}\n`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const onceIndex = args.indexOf('--once');
  if (onceIndex !== -1) {
    const question = args.slice(onceIndex + 1).join(' ').trim();
    if (!question) {
      console.error('Usage: npm run ask -- "your question"');
      process.exitCode = 1;
      return;
    }
    await answer(question);
    return;
  }

  console.log(`\n${face} ${name} is listening.`);
  console.log(`   ${config.mongo.collection} on ${config.mongo.dbName}, index ${config.mongo.indexName}`);
  console.log('   Type a question, "/remember <key> <fact>" to teach it something, or "/exit".\n');

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    for (;;) {
      const line = (await rl.question('> ')).trim();
      if (!line) continue;
      if (line === '/exit' || line === '/quit') break;

      if (line.startsWith('/remember ')) {
        const [, key, ...rest] = line.split(' ');
        const fact = rest.join(' ').trim();
        if (!key || !fact) {
          console.log('   Usage: /remember <key> <fact>\n');
          continue;
        }
        await remember(key, fact);
        console.log(`   Remembered "${key}".\n`);
        continue;
      }

      await answer(line);
    }
  } finally {
    rl.close();
  }
}

// One close, at the very end. The readline loop holds the process open on purpose, so
// without this the client's pooled sockets keep it open after the loop exits too.
await main();
await closeDb();
