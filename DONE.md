# DONE

Completed work, newest first. Active items live in [TODO.md](TODO.md).

## 2026-06-14 — NOW-tier product epic (from the BA feature-gap analysis)

Implemented the unblocked, highest-leverage gaps a business-analyst pass surfaced,
in five gated batches (each `npm run check` green); 117 → 135 tests.

- [x] **Topic taxonomy** (`bfaf689`): synthesizer tags each digest with 2–5
      canonical topics; `posts.topics` column; `?topic` filter on `/api/posts`
      and `/feed.xml` (+ `<category>` tags). The shared primitive under per-topic
      feeds, topic analytics, related posts and SEO.
- [x] **AI-content disclosure** (`be912b7`, adjusted): `aiGenerated` +
      configurable `aiDisclosure` on the API and the RSS channel — machine-
      readable metadata the site can label content with. (Per feedback, the
      visible "AI-generated" marker was removed from the OG card — the header
      already brands it; the disclosure is metadata, not stamped on the image.)
- [x] **Draft editing** (`7569a4a`): auth-gated `PATCH /api/posts/:id` edits the
      safe fields (title/summary/body/firstComment/hashtags/topics); FTS re-indexes
      on update. "Review" can finally mean "edit", not just accept/reject.
- [x] **Engagement rates** (`3a8633f`): `/api/analytics` gains an impression→click
      funnel + CTR, and `topPosts` ranks by engagement (clicks+shares), not raw
      volume. Deterministic ties; CTR guards divide-by-zero.
- [x] **Golden-set eval** (`d4a1a86`): deterministic scorer (citation validity,
      source coverage, length, topics) over a version-controlled golden set;
      `npm run eval` runs it. Makes prompt changes falsifiable without the live
      API; the scorer is fully unit-tested.
- [x] **Adversarial self-review** (workflow, 5 angles — partly rate-limited):
      clarified the eval scores citation _validity_, not semantic grounding;
      lowered the coverage gate to 0.5 (the synthesizer legitimately drops
      marketing); `detectTldr` now matches numbered lists; `aiDisclosure` uses
      `||` so an empty env doesn't blank it; `eval` uses `exitCode` not
      `process.exit`; **boot warning when `API_TOKEN` is unset** (mutating + PATCH
      endpoints are then unauthenticated). Gate green: 135 tests, 93.0/84.7/92.6.

## 2026-06-13 — Analytics feedback loop (engagement events)

- [x] **`post_events` table + `EventsRepository`** — per-post engagement events
      (view/click/impression/share + optional channel), FK to `posts` with
      `ON DELETE CASCADE`, drizzle schema + bootstrap DDL, covered by the schema
      drift test. No PII (type + source + timestamp only).
- [x] **`POST /api/posts/:id/events`** — public, unauthenticated ingestion (the
      consuming site has no token), accepted only for posts the caller can see
      (mirrors `/api/posts/:id` draft gating), throttled by the global rate limiter.
- [x] **`GET /api/analytics`** — totals, by type, by source, top posts, to inform
      prompt/topic tuning.
- [x] **Adversarial self-review** (workflow, 4 angles → verify, 19 findings): fixed
      a **draft-title leak** — analytics now aggregate published-post events only,
      so an unpublished post never surfaces via the public endpoint; bounded the
      `bySource` payload (`LIMIT`, since `source` is attacker-controlled); added a
      stable secondary sort so ranked output is deterministic. Documented the
      unbounded-growth ceiling of the public write path and backlogged a retention
      cron + optional `ANALYTICS_TOKEN`. Gate green: 117 tests, 92.2 / 84.7 / 92.2.

## 2026-06-13 — Open Graph card images

- [x] **`GET /og/posts/:id.png`** — on-the-fly 1200×630 PNG link-preview card per
      post (title, summary, source count, date). New `OgImageRenderer` port
      (`src/core/ports.ts`) + `SatoriOgRenderer` adapter (`src/og/`), wired in
      `container.ts`; pure, fully-tested card model in `src/og/card.ts`. Stack:
      satori (text → SVG `<path>`, so rendering never depends on a system font) +
      `@resvg/resvg-js` → PNG, both with prebuilt linux x64/arm64 + macOS binaries
      (zero Dockerfile diff). Font: Inter subset (Latin/Greek/Cyrillic, OFL-1.1)
      vendored as base64 in `font-data.ts` via the reproducible `npm run og:font`.
      Same draft visibility as the JSON route; serialized posts gain a relative
      `ogImageUrl`. Design chosen via a judge-panel workflow; stack de-risked with
      a render spike before coding.
- [x] **Adversarial self-review** (workflow, 5 angles → verify): fixed draft cards
      being publicly cacheable (Cache-Control now gated on `!trusted`), per-channel
      date locale, code-point-safe title clamp (no split surrogates), defensive
      `sources` JSON parse, keyed badge with a default, binary route hidden from the
      JSON OpenAPI contract, and the OFL license shipped inside the Docker image.
      Deferred (backlog): server-side OG cache/ETag, boot smoke render, language↔font
      coupling. Gate green: 106 tests, coverage 91.6 / 84.1 / 92.4.

## 2026-06-13 — Config enum validation + image supply chain

- [x] **Config enums validated at boot** (`eea006d`): a strict `oneOf()` helper
      joins `int()`/`bool()`; `LLM_EFFORT` and the previously-unvalidated
      `LOG_LEVEL` now fail fast on a bad value instead of reaching pino / the
      model API mid-run. Chose targeted enum hardening over a full zod rewrite —
      the helpers already reject every value that can be wrong; full zod moved to
      the backlog as ergonomics, not coverage.
- [x] **Base image pinned + scanned** (`2a00015`): `node:22-slim` pinned to its
      multi-arch manifest-list digest in both Dockerfile stages (still resolves
      per-arch); Dependabot `docker` ecosystem added to bump it monthly. New CI
      `docker` job builds the image (the build smoke that can't run locally) and
      Trivy-scans it for HIGH/CRITICAL OS/base CVEs (`ignore-unfixed` keeps the
      gate actionable) — coverage `npm audit` can't give. Publishing kiko's own
      multi-arch image via buildx deferred until there is a registry to push to.

## 2026-06-13 — Code review fixes (28 of 30 findings, two recall passes)

Worked in five gated batches; each ran `npm run check` green before committing.
Tests grew 46 → 78.

- [x] **Batch A — pipeline atomicity** (`604cc16`): `PostsRepository.commitDigest`
      writes the site post and marks its items digested in one transaction; the
      'site' post gates the run (a lost digest leaves items `new` to retry, never
      a duplicate); synthesis tokens are recorded on ok/partial/error alike.
      (R1a–R1d)
- [x] **Batch B — config/boot validation** (`d5920a6`): `int()` rejects
      non-integers and sub-minimum values; `bool()` accepts true/false/1/0/yes/no/
      on/off and throws otherwise; min ≤ max asserted; an invalid `PIPELINE_CRON`
      disables the scheduler instead of crashing boot. (R2a–R2d)
- [x] **Batch C — lifecycle** (`0ce59ee`): restart sweep moved off db module-load
      into `sweepInterruptedRuns()` (CLIs no longer flip a live run); shutdown
      only closes the DB when no run is mid-write; catch-up fires on a recent
      errored run, not just an overdue timestamp. (L1–L3, R3a-adjacent)
- [x] **Batch D — public API** (`2f0da53`): drafts hidden from unauthenticated
      callers (list/detail/search); 5xx messages no longer leak driver detail;
      `trustProxy` configurable; `/health` exempt from rate limiting; `/feed.xml`
      strips XML-illegal control chars and emits an absolute link; `regenerate`
      can't target `site`; public cache cut to 60s. (A1–A6, A7 mitigated)
- [x] **Batch E — sanitization/dates/FTS** (`7d3c9ac`): LLM slugs slugified;
      citation regex `\d+`; ingest dedupe keys on url too; `selectPending` orders
      by coalesce(publishedAt, fetchedAt); future-dated items no longer lead;
      FTS backfill detects a freshly-created index instead of the dead count
      comparison. (R3a, S1–S4)

Residuals tracked in TODO.md: R3b (drizzle-kit migrations) and A7 (CDN purge).

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
