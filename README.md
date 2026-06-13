# kiko

Backend service that collects AI news from curated sources, synthesizes the latest
developments with Claude into **site digest posts** and **LinkedIn-ready posts**, and
serves them over a REST API (the site consuming it is a separate, future project).

## Contents

- [Architecture](#architecture)
- [API](#api)
- [Running](#running)
- [Requirements](#requirements)
- [Token-spend design](#token-spend-design-why-its-built-this-way)
- [Documentation](#documentation)
- [License](#license)

## Architecture

```
 RSS feeds ──▶ sources/ ──▶ pipeline/ ──▶ generators/ ──▶ SQLite ──▶ REST API ──▶ site / LinkedIn
  (8 feeds)    RssSource     ingest → dedupe →  site post              (drizzle)
               cond. GET     cluster → Claude   linkedin post                ▲
                             synthesis          (second Claude call)    cron (croner)
```

Full module map, mermaid flow and the plug-in contract:
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

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
3. **Cluster** — greedy Jaccard similarity (≥ 0.4) over title tokens groups the same
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
| GET    | `/og/posts/:id.png`         | Open Graph card image (1200×630 PNG) for link previews         |
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
npm run test:coverage  # c8 coverage report with ratchet thresholds
npm run typecheck
npm run lint           # eslint (type-checked)
npm run format         # prettier --write
npm run db:backup      # online SQLite backup into data/backups/
npm run og:font        # regenerate the vendored OG-card font (needs fonttools)
```

OpenAPI spec: `GET /openapi.json` (generated from the route schemas).

### Open Graph images

`GET /og/posts/:id.png` renders a 1200×630 card (title, summary, source count,
date) for social/link previews. It follows the same draft visibility as the
JSON post route — unpublished posts are `404` to the public. Rendering is
on-the-fly with [satori](https://github.com/vercel/satori) (layout + text → SVG
`<path>`, so output never depends on a system font) rasterized to PNG by
[`@resvg/resvg-js`](https://github.com/yisibl/resvg-js); both ship prebuilt
binaries for linux x64/arm64 and macOS, so the Docker image needs no fonts or
build tools (CI builds and Trivy-scans the image on linux/amd64). The card font
is a subset of [Inter](https://rsms.me/inter/) (OFL-1.1, see
[docs/licenses/Inter-OFL.txt](docs/licenses/Inter-OFL.txt)) vendored as base64
in `src/og/font-data.ts`; regenerate it with `npm run og:font` (needs `python3`
with `fonttools`). The subset covers **Latin, Greek and Cyrillic** — a post title
in another script (e.g. Arabic, Hebrew, CJK) renders with missing glyphs, so widen
the subset ranges in `scripts/build-og-font.mjs` before setting a `*_LANGUAGE` to
such a language.

Each serialized post carries a relative `ogImageUrl`; the frontend builds the
absolute URL from its own origin and emits the meta tags:

```html
<meta property="og:image" content="{ORIGIN}/og/posts/{id}.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:type" content="image/png" />
<meta name="twitter:card" content="summary_large_image" />
```

### Docker

```bash
docker build -t kiko .
docker run -d -p 3000:3000 -v kiko-data:/app/data -e ANTHROPIC_API_KEY=sk-ant-... kiko
```

The base image is pinned by its multi-arch manifest-list digest (reproducible
builds, bumped by Dependabot); CI builds the image on every push and Trivy-scans
it for HIGH/CRITICAL OS CVEs.

Configuration is environment-only — see [.env.example](.env.example) for every knob
(model, effort, cron, item limits, output language).

## Requirements

- **Node.js ≥ 20.12** — development and CI run on Node 22 (`.nvmrc`).
- **macOS / Linux** — `better-sqlite3` ships prebuilt binaries for both;
  ⚠️ Windows is untested (use WSL or Docker).
- A persistent filesystem for the SQLite database (`DB_PATH`, default
  `./data/kiko.db`) — not compatible with ephemeral/serverless filesystems.
- `ANTHROPIC_API_KEY` for pipeline runs; the server, tests and `npm run ingest`
  work without it.

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

## Documentation

| Document                                         | Contents                                       |
| ------------------------------------------------ | ---------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)     | Module map, pipeline flow, plug-in contract    |
| [docs/PRODUCT_STATE.md](docs/PRODUCT_STATE.md)   | What works today, metrics snapshot, known gaps |
| [docs/best-practices.md](docs/best-practices.md) | Research behind the design decisions           |
| [docs/db-analysis.md](docs/db-analysis.md)       | Why SQLite, and when to move off it            |
| [CONTRIBUTING.md](CONTRIBUTING.md)               | Dev setup, quality gates, conventions          |
| [CHANGELOG.md](CHANGELOG.md)                     | Notable changes (keep-a-changelog)             |
| [TODO.md](TODO.md) / [DONE.md](DONE.md)          | Active work / completed history                |

## License

[MIT](LICENSE)
