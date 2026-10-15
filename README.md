# Maggie

Maggie is a command-line retrieval-augmented agent. It embeds a question, searches memories with MongoDB Atlas Vector Search, and either prints those matches or asks an OpenAI-compatible chat model to answer from them.

This repository is a public portfolio snapshot from a MongoDB quest on September 30, 2026. The owner built it during a day-long conference. It is not a deployed service. The CLI exits before the prompt unless `MONGODB_URI` and `VOYAGE_API_KEY` are set, so this README does not include a session screenshot.

## What it does

`npm start` opens a prompt. A line of text is a question. These commands are handled in `src/index.ts`:

- `/remember <key> <fact>` stores one fact. The key is the first word after `/remember`; the rest of the line is the fact. The fact is embedded and upserted on `key`.
- `/exit` and `/quit` close the prompt.
- `npm run ask -- "question"` asks once and exits.

For each question, `src/agent.ts` calls `retrieve()`:

1. Voyage embeds the question (`input_type: query`).
2. The `teas` collection is queried with `$vectorSearch` on `search.embeddings`.
3. Each hit keeps a key (`key`, or `id` if there is no key), text (`fact`, or `search.text` if there is no fact), and the `vectorSearchScore`. Hits with no text are dropped.

The query is written to return two document shapes from that one collection: memories stored by this agent (`key` and `fact`) and quest-corpus documents whose text lives at `search.text`. This repository does not include that corpus. `memory.seed.json` is an empty array, so a fresh setup stores no memories until facts are added there or with `/remember`.

If `LLM_API_KEY` is set, the matches are placed in the system prompt and `src/llm.ts` POSTs them to `{LLM_BASE_URL}/chat/completions`. The CLI then prints the reply and, when there are hits, a `recalled:` line of keys. If `LLM_API_KEY` is unset, the CLI prints the scores and facts and does not print that `recalled:` line. `src/llm.ts` uses temperature `0.3`.

The names in `agent.config.json` under `skills` are inserted into the system prompt as text. This repository does not implement those skills as tools.

`npm run setup` is idempotent. It creates the collection only when it is missing, creates the vector index only when it is missing, polls until that new index reports `queryable` (up to five minutes, every five seconds), then embeds every item in `memory.seed.json`. An index that already exists is left as it is. Re-run setup after changing the embedding model or dimensions in `agent.config.json`; both invalidate stored vectors.

## Stack

| Piece | What the repo uses |
|---|---|
| Runtime | Node.js `>=22.9.0` (the scripts pass Node's `--env-file-if-exists`) |
| Language | TypeScript, ESM, `"type": "module"`, run with `tsx`. `tsc` is typecheck only (`noEmit`) |
| Database driver | `mongodb` |
| Vectors | Voyage HTTP API, model `voyage-4`, 512 dimensions, `output_dtype: int8`, stored as BSON binary via `Binary.fromInt8Array` |
| Search | MongoDB Atlas `$vectorSearch`, index `tea_vector_index`, path `search.embeddings`, cosine similarity |
| Answers | Optional OpenAI-compatible chat completions. Default base URL `https://api.openai.com/v1`. Default model name `gpt-5.6-luna` from `agent.config.json` |

Declared ranges are in `package.json`. This tree has no test runner and no CI workflow.

## Architecture

```text
src/index.ts          prompt, /remember, one-shot --once
    -> src/agent.ts   retrieve, then chat or retrieval-only text
         -> src/retrieve.ts
              -> src/embed.ts    Voyage
              -> src/db.ts       one shared MongoClient
         -> src/llm.ts           POST /chat/completions
scripts/setup.ts      collection, vector index, seed
src/memory.ts         read memory.seed.json, upsert one fact
src/config.ts         agent.config.json plus environment variables
```

`src/db.ts` keeps a single `MongoClient` for the process. `src/retrieve.ts` asks for `numCandidates` of `limit * 15` and a default `limit` of 5. `src/memory.ts` also exports `allMemories()`, which reads documents that have both `key` and `fact`. The CLI never calls it.

Identity, prompt, database names, embedding width, and quest metadata live in `agent.config.json`. Connection strings and API keys are read from the environment in `src/config.ts` and are not written by these scripts.

## Configuration

`agent.config.json` currently sets:

| Field | Value |
|---|---|
| Agent | Maggie, face 🤖, model `gpt-5.6-luna` |
| System prompt | "You are Maggie, a helpful agent with a memory stored in MongoDB Atlas. You answer from what you remember, and you say so plainly when you do not know something." |
| Custom instructions | empty (omitted from the prompt when blank) |
| Skills (prompt text only) | `mongodb-fundamentals`, `vector-search`, `agent-memory`, `prompt-context-engineering`, `coding-debugging` |
| Database | `quests-a7640941cf2c45eaa695aefb` |
| Collection | `teas` |
| Index | `tea_vector_index` |
| Vector path | `search.embeddings` |
| Embedding | `voyage-4`, 512 dimensions |
| Quest record | codename Chinchilla-Scout, 4 quests, score 78 |

The CLI prints the agent name, face, collection, database, and index. It does not print the quest score.

Copy `.env.example` to `.env` and supply values. The example file lists names only. `.env` is gitignored.

| Variable | Required | Used for |
|---|---|---|
| `MONGODB_URI` | yes | Atlas connection string |
| `VOYAGE_API_KEY` | yes | Voyage embeddings |
| `LLM_API_KEY` | no | Turns on chat answers. Unset means retrieval-only output |
| `LLM_BASE_URL` | no | Chat endpoint. Default `https://api.openai.com/v1` |
| `LLM_MODEL` | no | Chat model. Default `agent.model` in `agent.config.json` |
| `DB_NAME` | no | Overrides `database.dbName` |

`MONGODB_URI` and `VOYAGE_API_KEY` are read when `src/config.ts` loads. `npm start`, `npm run ask`, and `npm run setup` all fail immediately if either is missing.

## Setup

Requirements: Node.js 22.9.0 or newer, an Atlas connection string, and a Voyage API key. `$vectorSearch` and `createSearchIndex` in this code target Atlas Vector Search.

```bash
npm install
cp .env.example .env
npm run typecheck
npm run setup
npm start
```

Fill in `.env` before `npm run setup` or `npm start`. `npm run typecheck` does not need those variables.

Source comments describe two quest setups. A Pathfinder cluster was one the player already had; setup should find `teas` and `tea_vector_index` and only add memories. A Trailblazer cluster from the event was temporary; point `MONGODB_URI` at a cluster you control and setup creates the collection and index. This repository does not contain a connection string.

An index created here is cosine similarity on `search.embeddings` with `numDimensions` taken from `agent.config.json` (512). The definition does not set a quantization mode. Embeddings are stored as int8 BSON binaries.

## Event

Git history has one commit, `022ae99`, authored September 30, 2026, with the message "My agent from the MongoDB quest" and the body "Built by Chinchilla-Scout." The committed `agent.config.json` records the same codename, 4 completed quests, and a score of 78. The initial README said the tree was generated by the MongoDB Quest Platform, with `agent.config.json` and `memory.seed.json` taken from the session.

The owner built that session in a day-long conference. The repo is the portfolio copy of the result. Nothing here starts a server, and no deployment config is included.

## Repository layout

| Path | Role |
|---|---|
| `agent.config.json` | Name, prompt, skills, database, embedding settings, quest metadata |
| `memory.seed.json` | Seed facts. Currently `[]` |
| `src/config.ts` | Loads the JSON file and environment variables |
| `src/index.ts` | CLI |
| `src/agent.ts` | Retrieve, then answer |
| `src/retrieve.ts` | `$vectorSearch` |
| `src/embed.ts` | Voyage embeddings |
| `src/llm.ts` | OpenAI-compatible chat |
| `src/memory.ts` | Seed load and upsert |
| `src/db.ts` | Shared MongoDB client |
| `scripts/setup.ts` | Collection, vector index, seed |
| `.env.example` | Environment variable names only |

## Contributors

Git history credits one author:

- **Shay Bouchles** — initial commit, September 30, 2026 (`022ae99`, "My agent from the MongoDB quest"). The quest codename in that commit and in `agent.config.json` is Chinchilla-Scout.

## License

MIT. The copyright line in `LICENSE` is Copyright (c) 2026 MongoDB, Inc.
