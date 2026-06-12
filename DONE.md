# DONE

Completed work, newest first. Active items live in [TODO.md](TODO.md).

## 2026-06-12 — repo-standard pass

- [x] History hygiene: AI attribution trailer stripped (tree verified
      byte-identical), author email gmail everywhere, force-pushed clean.
- [x] MIT LICENSE + license/author/repository metadata (`065e718`).
- [x] Unified `npm run check` gate; c8 coverage ratchet at the measured floor
      (85/80/88); CI matrix ubuntu + macos with honest step names (`ce15c51`).
- [x] Documentation set: CONTRIBUTING, CHANGELOG, docs/ARCHITECTURE,
      docs/PRODUCT_STATE; TODO/DONE split and switched to English.

## 2026-06-12 — GitHub: remote, identity, Dependabot consolidation

- [x] origin → github.com/LeassTaTT/kiko (HTTPS, osxkeychain).
- [x] All commits rewritten to `ivanbbaev@gmail.com` (local git config; the
      global config keeps the work address for work repos).
- [x] main pushed with the clean history; CI + Dependabot active.
- [x] Dependabot branch sprawl fixed: 3 pending updates cherry-picked into
      main (checkout v6, setup-node v6, eslint 10.5.0), branches deleted,
      config consolidated to one grouped monthly PR per ecosystem.

## 2026-06-12 — Quality gates + OpenAPI

- [x] OpenAPI spec at `GET /openapi.json` generated from route schemas.
- [x] ESLint (type-checked) + Prettier across the whole repo; CI gate.
- [x] LLM layer unit tests via clientFactory injection (7 tests: success /
      refusal / max_tokens / unparseable / prompt format); coverage 85.8%.
- [x] pino-pretty dev logs.

## 2026-06-12 — TODO backlog worked (triple analysis + 11/10 deep analysis)

- [x] Functional: `POST /api/posts/:id/regenerate`, webhook notifications
      (`run.error`/`run.partial`/`post.published`), persistent feed validators.
- [x] Reliability: stale-run sweep on boot, graceful shutdown draining the
      active run + clean WAL close, explicit LLM timeout/retries, boot
      catch-up run (`CATCH_UP_HOURS`), missing-key boot warning.
- [x] Security/API: timing-safe bearer auth, JSON schema validation on all
      inputs, pagination metadata, unified `{error, statusCode}` shape.
- [x] Observability/LLM quality: single pino root, deep `/health` (last run,
      next fire), deterministic `[n]` citation check, prompt versioning
      (sha256 in `posts.prompt_version`), strict numeric config parsing.
- [x] Product: FTS5 search endpoint, per-channel languages
      (`SITE_LANGUAGE`/`LINKEDIN_LANGUAGE`), own RSS feed at `/feed.xml`.
- [x] Ops: git init + AI files in `.git/info/exclude`, CI workflow, Dependabot,
      docker-compose, `npm run db:backup` (online SQLite backup API).

## 2026-06-12 — Production hardening research (implemented)

- [x] SQLite production pragmas: `synchronous=NORMAL`, `busy_timeout=5000`,
      20MB page cache (on top of WAL).
- [x] Fastify hardening: helmet security headers + per-IP rate limit.
- [x] Conditional GET for RSS (ETag/If-Modified-Since → 304) — verified live
      against TechCrunch; `Cache-Control: public, max-age=300` on post reads.

## 2026-06-12 — Three improvement iterations + OOP modularization

- [x] Ingest: atomic batch INSERT (was N+1), batch-scoped hash dedupe
      (was full-table load), custom User-Agent, parsed JSON fields in API.
- [x] Observability: structured pino logging, per-run token columns with
      `ensureColumn` mini-migration.
- [x] Product: `posts.sources` citation map, 2× cluster capacity selection,
      current date in the prompt, pipeline tests with fake ports (in-memory DB).
- [x] Ports & adapters refactor: `NewsSource`/`DigestSynthesizer`/`PostGenerator`
      ports, plug-in registries (±1 line per module), repositories, DI'd
      `Pipeline`, composition root `container.ts`.

## 2026-06-12 — Towards "110% working"

- [x] All 8 RSS feeds verified live (200 + XML).
- [x] CORS; ingest-only CLI (zero tokens) verified live: 55 items, second run
      0 new — dedupe works end-to-end.
- [x] First test suite (24 tests) — caught a real bug: dedupe and clustering
      normalized punctuation differently ("GPT-6" ≠ "GPT 6").
- [x] Production build config (tests excluded from dist), Dockerfile
      (multi-stage, non-root, healthcheck), .dockerignore.

## 2026-06-12 — Reviews: senior + architect (all findings fixed)

- [x] Senior: safe feed-date parsing; recovery semantics (items marked digested
      right after the site post → LinkedIn failure = `partial` run, no double
      synthesis spend); max_tokens raised + truncation handling; unique slugs;
      query guards.
- [x] Architect: publish workflow (`publish`/`unpublish` + `?status` filter),
      optional bearer auth, graceful shutdown, cron timezone, fail-fast effort
      validation, partial unique slug index, DB-checked health.

## 2026-06-12 — Skeleton, research, DB analysis

- [x] TypeScript/Node 22 skeleton: Fastify, SQLite (better-sqlite3 + drizzle),
      croner, rss-parser; REST API; daily cron pipeline.
- [x] Deep research → docs/best-practices.md: clustering before the LLM
      (20–40% prompt reduction), anti-hallucination ICE prompt rules,
      LinkedIn 2026 format (hook ≤210 chars, 1300–2000 chars, 3–5 hashtags,
      links in first comment), token-spend levers.
- [x] DB analysis → docs/db-analysis.md: SQLite now; defined triggers for
      moving to Postgres (multi-instance, pgvector, managed) or Turso
      (serverless).
- [x] Token accounting per post + `/api/usage`.
