// The generation half.
//
// Deliberately spoken in OpenAI's chat-completions shape rather than any single vendor's
// SDK, because that shape is the one nearly everything implements. Set LLM_BASE_URL to
// point this at OpenAI, a local Ollama, or anything else that answers the same way — you
// should not have to rewrite your agent to change your mind about a model.

import { config } from './config.js';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

/** Whether a real model is reachable. False means the agent runs in retrieval-only mode. */
export function llmConfigured(): boolean {
  return Boolean(config.llm.apiKey);
}

export async function chat(messages: Message[]): Promise<string> {
  if (!config.llm.apiKey) throw new Error('LLM_API_KEY is not set.');

  const res = await fetch(`${config.llm.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.llm.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: config.llm.model, messages, temperature: 0.3 }),
  });

  const body = (await res.json().catch(() => ({}))) as ChatResponse;
  if (!res.ok) {
    throw new Error(`${config.llm.model} returned ${res.status}: ${body.error?.message ?? 'no detail'}`);
  }

  const answer = body.choices?.[0]?.message?.content;
  if (!answer) throw new Error('The model returned an empty response.');
  return answer;
}
