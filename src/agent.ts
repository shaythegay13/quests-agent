// Retrieve, then answer.
//
// The whole agent is the twenty lines of `ask()` below, and that is the point: once the
// vectors are in the right shape and the index exists, an agent is not a large thing.

import { config } from './config.js';
import { retrieve, type Hit } from './retrieve.js';
import { chat, llmConfigured, type Message } from './llm.js';

export interface Answer {
  text: string;
  hits: Hit[];
  /** True when no model was configured and `text` is just the retrieved context. */
  retrievalOnly: boolean;
}

function buildSystemPrompt(hits: Hit[]): string {
  const parts = [config.systemPrompt];
  if (config.customInstructions.trim()) parts.push(config.customInstructions);
  if (config.skills.length) parts.push(`Skills you have been given: ${config.skills.join(', ')}.`);

  // Grounding instruction and context in the same message, because the model should treat
  // "what I remember" as one thing. Saying "say so" rather than letting it improvise is
  // what stops a small agent confidently inventing a memory it does not have.
  parts.push(
    hits.length
      ? `Here is what you remember, most relevant first. Answer from it. If it does not cover the question, say so plainly.\n\n${hits
          .map((h) => `- (${h.score.toFixed(3)}) ${h.fact}`)
          .join('\n')}`
      : 'You remember nothing relevant to this question. Say so plainly rather than guessing.'
  );

  return parts.join('\n\n');
}

export async function ask(question: string): Promise<Answer> {
  const hits = await retrieve(question);

  if (!llmConfigured()) {
    const text = hits.length
      ? `Retrieval-only mode (no LLM_API_KEY set). Closest memories:\n\n${hits
          .map((h) => `  ${h.score.toFixed(3)}  ${h.fact}`)
          .join('\n')}`
      : 'Retrieval-only mode (no LLM_API_KEY set), and nothing in memory matched that.';
    return { text, hits, retrievalOnly: true };
  }

  const messages: Message[] = [
    { role: 'system', content: buildSystemPrompt(hits) },
    { role: 'user', content: question },
  ];
  return { text: await chat(messages), hits, retrievalOnly: false };
}
