# kiko

Backend service that collects AI news from curated sources, synthesizes the latest
developments with Claude into **site digest posts** and **LinkedIn-ready posts**, and
serves them over a REST API (the site consuming it is a separate, future project).

## Architecture

```
            ┌─────────────────────────────────────────────────────────┐
            │                      kiko (Fastify)                     │
            │                                                         │
 RSS/Atom ─▶│ ingest/          pipeline/run.ts          llm/          │
 (8 feeds)  │  fetcher    ──▶   1. fetch + dedupe  ──▶  synthesize ──┐│
            │  dedupe           2. cluster stories      (Claude)     ││
            │  cluster          3. site post            linkedin     ││
            │                   4. linkedin post        (Claude)     ││
            │                   5. mark digested                     ││
            │                          │                             ││
            │                          ▼                             ││
            │                   SQLite (drizzle) ◀───────────────────┘│
            │                   news_items / posts / runs             │
            │                          │                              │
            │   REST API  ◀────────────┘      scheduler (croner)      │
            └─────────────────────────────────────────────────────────┘
                   │
                   ▼
            future site / manual LinkedIn publishing
```

### Module structure (ports & adapters)

Everything pluggable sits behind an interface in [src/core/ports.ts](src/core/ports.ts);
concrete implementations are wired in exactly one place — [src/container.ts](src/container.ts).

| Module                         | Role                                                     | Plug-in point                                                          |
| ------------------------------ | -------------------------------------------------------- | ---------------------------------------------------------------------- |
| `core/`                        | Domain types, ports, pure logic (dedupe, clustering)     | —                                                                      |
| `sources/`                     | `NewsSource` implementations (RSS today)                 | **[sources/index.ts](src/sources/index.ts)** — add/remove a line       |
| `llm/`                         | Anthropic client + `DigestSynthesizer`                   | swap in container                                                      |
| `generators/`                  | `PostGenerator` per output channel (site, LinkedIn)      | **[generators/index.ts](src/generators/index.ts)** — add/remove a line |
| `db/`                          | Drizzle schema + repository classes                      | —                                                                      |
| `pipeline/`                    | `Pipeline` class — orchestration only, all deps injected | —                                                                      |
| `server/`, `cli/`, `scheduler` | Delivery mechanisms over the same container              | —                                                                      |

To add an output channel (e.g. X/Twitter): implement `PostGenerator` in
`src/generators/x.ts`, add it to the registry array — done. Generators run
independently; one failing marks the run `partial`, the rest still publish.

**Pipeline** (cron, default 07:00 daily; also triggerable via API):

1. **Ingest** — fetch all feeds in parallel (`rss-parser`), drop items older than
   `MAX_ITEM_AGE_DAYS`, strip HTML, trim summaries to `ITEM_SUMMARY_MAX_CHARS`.
2. **Dedupe** — content hash over normalized title + canonical URL (tracking params
   stripped); unique URL constraint as second line of defense. Nothing already seen
   re-enters the pipeline.
3. **Cluster** — greedy Jaccard similarity (≥ 0.5) over title tokens groups the same
   story covered by multiple feeds into one entry ("also covered by: …").
4. **Synthesize** — one Claude call (structured output, adaptive thinking) produces the
   site digest post with inline `[n]` source citations. Grounding rules forbid facts
   not present in the inputs.
5. **LinkedIn** — a second, cheap Claude call derives the LinkedIn post **from the
   digest** (not from the raw items), with platform-specific formatting rules.
6. Items are marked `digested`; the run and per-post token usage are recorded.

If fewer than `MIN_ITEMS_PER_DIGEST` new stories exist, the run is skipped — no LLM
call, no tokens.

## API

| Method | Path                        | Description                                                    |
| ------ | --------------------------- | -------------------------------------------------------------- |
| GET    | `/health`                   | Liveness + DB check + last run / next cron fire                |
| GET    | `/api/posts`                | List posts (`?kind&status&limit&offset`), pagination metadata  |
| GET    | `/api/posts/search`         | FTS5 full-text search (`?q=&limit=`)                           |
| GET    | `/api/posts/:id`            | Single post (sources resolve `[n]` citations to URLs)          |
| POST   | `/api/posts/:id/publish`    | Mark a post as published 🔒 (fires `post.published` webhook)   |
| POST   | `/api/posts/:id/unpublish`  | Back to draft 🔒                                               |
| POST   | `/api/posts/:id/regenerate` | New channel post from an existing digest (`?kind=linkedin`) 🔒 |
| GET    | `/feed.xml`                 | RSS feed of published site posts                               |
| GET    | `/api/news`                 | Raw news items (`?status=new\|digested`)                       |
| POST   | `/api/pipeline/run`         | Trigger a pipeline run (202, background) 🔒                    |
| GET    | `/api/runs`                 | Last 20 pipeline runs (incl. token spend per run)              |
| GET    | `/api/usage`                | Aggregate token spend across all posts                         |

🔒 — when `API_TOKEN` is set, these require `Authorization: Bearer <token>`.
Posts are created as `draft`; the site should query `?status=published`.
Errors are uniformly `{ "error": string, "statusCode": number }`.
When `WEBHOOK_URL` is set, `run.error` / `run.partial` / `post.published`
events are POSTed there as JSON.

## Running

```bash
nvm use                # Node 22 (.nvmrc)
cp .env.example .env   # set ANTHROPIC_API_KEY
npm install
npm run dev            # server + scheduler
npm run ingest         # feeds → DB only, no LLM calls (zero tokens)
npm run pipeline       # full one-off pipeline run from the CLI
npm run test           # unit + integration tests (node:test, in-memory SQLite)
npm run test:coverage  # с8 coverage report
npm run typecheck
npm run lint           # eslint (type-checked)
npm run format         # prettier --write
npm run db:backup      # online SQLite backup into data/backups/
```

OpenAPI spec: `GET /openapi.json` (generated from the route schemas).

### Docker

```bash
docker build -t kiko .
docker run -d -p 3000:3000 -v kiko-data:/app/data -e ANTHROPIC_API_KEY=sk-ant-... kiko
```

Configuration is environment-only — see [.env.example](.env.example) for every knob
(model, effort, cron, item limits, output language).

## Token-spend design (why it's built this way)

Measured levers, in order of impact for this workload:

1. **Don't call the LLM at all** — dedupe + "only new items" + `MIN_ITEMS_PER_DIGEST`
   guard mean a quiet news day costs zero tokens.
2. **Shrink the input** — summaries trimmed at ingest, URLs excluded from prompts,
   same-story clustering collapses multi-feed coverage (industry data: 20–40% prompt
   reduction). Input tokens dominate this workload's cost.
3. **Shrink the output** — structured outputs (zod schemas) instead of free-form prose;
   the LinkedIn post is derived from the ~1K-token digest, not the full item list.
4. **Observability** — per-post `input/output/cache` token counts in the DB,
   aggregated at `GET /api/usage`. You can't optimize what you don't measure.
5. **Effort knob** — `LLM_EFFORT` (low/medium/high/max) controls thinking depth and
   token spend per call; `high` is the default, drop to `medium` if quality holds.

Database choice (SQLite now, Postgres/Turso triggers defined) is analyzed in
[docs/db-analysis.md](docs/db-analysis.md).

Deliberately **not** used (yet), with reasoning — see
[docs/best-practices.md](docs/best-practices.md):

- **Prompt caching** — our system prompts are far below the 4096-token minimum
  cacheable prefix for `claude-opus-4-8`, and runs are ~24h apart (cache TTL is
  5 min–1 h). Becomes relevant only if full article bodies enter the context.
- **Batches API** — flat 50% discount and a perfect fit for a latency-insensitive
  pipeline; skipped for now because at 2 calls/day the absolute savings don't justify
  the polling complexity. First thing to add if call volume grows.
- **Model routing** — `ANTHROPIC_MODEL` is configurable; routing cheaper models to
  cheaper steps is a product decision, not a default.
