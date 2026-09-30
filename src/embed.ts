// Text in, vector out.
//
// This is the same Voyage call the quest platform makes, at the same width and — the part
// that matters — the same *dtype*. Get a key at https://voyageai.com; the free tier is
// generous enough for this agent.
//
// `output_dtype: 'int8'` is not an optimization. The corpus you indexed during the quest
// ships pre-quantized to int8 and stored as BSON binary, and Atlas will only match a query
// vector against pre-quantized BinData when it is the same width and dtype. Ask for a plain
// float array here and every search returns zero results with no error — the index is fine,
// the query is fine, they just never meet. (That is different from automatic quantization,
// where Atlas quantizes a float query for you. Pre-quantized data does not get that.)

import { Binary } from 'mongodb';
import { config } from './config.js';

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';

interface VoyageResponse {
  data?: { embedding?: number[] }[];
  detail?: string;
}

/**
 * `input_type` matters more than it looks. Voyage embeds a search query and a stored
 * document into slightly different places on purpose, and using 'document' for both is the
 * single most common reason retrieval quality quietly drops — results come back, they are
 * just worse, so nothing looks broken.
 */
export async function embed(text: string, inputType: 'query' | 'document'): Promise<Binary> {
  const res = await fetch(VOYAGE_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.embedding.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      input: [text],
      model: config.embedding.model,
      input_type: inputType,
      output_dimension: config.embedding.dimensions,
      output_dtype: 'int8',
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `Voyage returned ${res.status}: ${detail.slice(0, 300)}\n` +
        `If this mentions output_dtype, your model predates int8 output — the 4-series supports it.`
    );
  }

  const body = (await res.json()) as VoyageResponse;
  const vector = body.data?.[0]?.embedding;
  if (!vector) throw new Error('Voyage returned no embedding.');

  if (vector.length !== config.embedding.dimensions) {
    throw new Error(
      `Expected a ${config.embedding.dimensions}-dimension vector but got ${vector.length}. ` +
        `Your vector index and agent.config.json have to agree — re-run \`npm run setup\` after changing either.`
    );
  }

  // Subtype 9 (BSON binary vector), dtype int8 — byte-for-byte what the corpus already holds.
  return Binary.fromInt8Array(Int8Array.from(vector));
}
