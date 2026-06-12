# Product state

Snapshot date: **2026-06-12**.

## What works today

- **Ingestion** (verified against live feeds): 8 RSS sources fetched in
  parallel with conditional GET; dedupe holds end-to-end (second run on the
  same day ingests 0 new items); same-story clustering merges multi-outlet
  coverage.
- **Synthesis + LinkedIn generation** (verified with mocked client only —
  see gaps): structured outputs, grounding rules, citation map per post,
  prompt versioning, token accounting per post and per run.
- **REST API**: full surface (posts list/search/detail, publish workflow,
  regenerate, runs, usage, deep health, own RSS feed, OpenAPI spec) behind
  helmet + rate limit + optional timing-safe bearer auth; JSON schema
  validation on all inputs.
- **Scheduling & reliability**: daily cron with timezone support, boot
  catch-up run, stale-run sweep, graceful shutdown with run drain, webhook
  notifications on failures and publishes.
- **Ops**: Dockerfile + compose (image not yet built — see gaps), online
  SQLite backup CLI, CI on ubuntu + macos, Dependabot grouped monthly.

## Metrics snapshot (2026-06-12)

| Metric                   | Value                                                      |
| ------------------------ | ---------------------------------------------------------- |
| Tests                    | 46 passing / 0 failing (node:test)                         |
| Coverage                 | 85.84% statements/lines, 80.28% branches, 88.37% functions |
| Coverage gates (ratchet) | ≥85% stmts/lines, ≥80% branches, ≥88% functions            |
| Lint                     | 0 errors, 0 warnings (type-checked ESLint)                 |
| `npm audit`              | 0 vulnerabilities                                          |
| Unified gate             | `npm run check` green on Node 22                           |

## Known gaps

1. **No live LLM run yet** — the synthesis path is covered by unit tests with
   a mocked client, but has never executed against the real Anthropic API
   (needs `ANTHROPIC_API_KEY` in `.env`, then `npm run pipeline`).
2. **Docker image never built** — Dockerfile and compose exist; the local
   Docker daemon wasn't running when this snapshot was taken.
3. **No external uptime monitoring** on `/health`.
4. **No golden-set eval** for synthesis quality — prompt changes are not yet
   falsifiable (blocked on the API key as well).

Active work and backlog: [TODO.md](../TODO.md). Completed history: [DONE.md](../DONE.md).
