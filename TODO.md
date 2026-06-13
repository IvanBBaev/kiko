# TODO

> **Execution policy:** items are worked top-to-bottom within a section unless
> stated otherwise. Every item ends with the quality gates green
> (`npm run check`) and a commit. Finished items move to [DONE.md](DONE.md)
> with the date and commit hash. Keep statuses truthful.

## Blocked on external factors

- [ ] First real pipeline run against the Anthropic API — requires
      `ANTHROPIC_API_KEY` in `.env`, then `npm run pipeline`. The non-LLM half
      is verified against live feeds; the synthesis path is unit-tested with a
      mocked client only.
- [ ] `docker build` smoke — the Docker daemon was not running. Start Docker
      Desktop and run `docker compose up --build`.
- [ ] External uptime monitoring on `/health` (UptimeRobot / healthchecks.io) —
      needs an account.

## Code review backlog (2026-06-13, 30 confirmed findings, two recall passes)

Worked top-down. Three systemic roots fix many at once; tackle those first.

### Root 1 — pipeline atomicity

- [ ] R1a `insert` + `markDigested` are two un-transacted writes; a crash between
      them re-digests items and creates a duplicate post (pipeline.ts:137).
- [ ] R1b error path records no synthesis tokens and skips markDigested → the
      paid Opus call is invisible and re-billed next run (pipeline.ts:169).
- [ ] R1c site generator fails but LinkedIn succeeds → items marked digested, the
      canonical site digest is lost with no regen path (pipeline.ts:143).
- [ ] R1d on that partial run the already-paid synthesis tokens are never summed
      onto the run (pipeline.ts:139).

### Root 2 — boot & config validation

- [ ] R2a invalid `PIPELINE_CRON` makes `new Cron()` throw at top-level → whole
      server fails to boot instead of disabling the scheduler (scheduler.ts:21).
- [ ] R2b `bool()` coerces anything but 'true'/'1' to false → `TRUE`/`yes`/`on`
      silently disables the scheduler (config.ts:18).
- [ ] R2c `int()` accepts negative/fractional/non-integer despite "strict"
      docstring (config.ts:12).
- [ ] R2d no `minItemsPerDigest <= maxItemsPerDigest` check (config.ts:61).

### Root 3 — schema single source / FTS

- [ ] R3a FTS drift-repair compares count(\*) of an external-content FTS table vs
      posts — structurally always equal, rebuild branch is dead code; desynced
      index never self-heals (client.ts:109).
- [ ] R3b schema defined twice (drizzle schema.ts + raw DDL in client.ts) — drift
      risk; longer-term: real migrations (already in backlog).

### Lifecycle / recovery

- [ ] L1 restart sweep runs at module-load of client.ts, which the CLIs import →
      `db:backup`/`ingest` flips a live run to error (client.ts:115).
- [ ] L2 `sqlite.close()` fires after the drain deadline even while a run is in
      flight → next write hits a closed DB (index.ts:47).
- [ ] L3 catch-up gate checks only `startedAt`, ignores status → a recent crashed
      run blocks the catch-up that should rescue it (index.ts:23).

### API / routes

- [ ] A1 `/api/posts/search`, `/api/posts`, `/api/posts/:id` return DRAFT posts to
      unauthenticated callers (no status filter) (routes.ts:157). **highest**
- [ ] A2 global error handler sends `err.message` verbatim on 5xx → driver detail
      leaks to the public (app.ts:22).
- [ ] A3 rate-limit keys on `req.ip` with no `trustProxy` → all clients behind a
      proxy share one bucket (app.ts:29).
- [ ] A4 `/health` is rate-limited (global:true) → Docker HEALTHCHECK can 429
      under a spike and mark the container unhealthy (app.ts:29).
- [ ] A5 `regenerate?kind` has no enum → `kind=site` duplicates the site post
      (routes.ts:84); regenerate is non-idempotent on retry (routes.ts:210).
- [ ] A6 `/feed.xml` emits raw XML-1.0-illegal control chars (routes.ts:241) and a
      relative `<link>` when PUBLIC_SITE_URL unset (routes.ts:234).
- [ ] A7 unpublish doesn't invalidate the 5-min public cache → retracted post
      served by CDN up to 5 min (routes.ts:172).

### Input sanitization / dates

- [ ] S1 LLM slug stored without slugification → spaces/slashes/unicode persist
      and reach feed links (posts-repository.ts:37).
- [ ] S2 citation regex `\d{1,3}` misses `[n]` with 4+ digits (citations.ts:8).
- [ ] S3 batch dedupe keys on contentHash (title-derived) but UNIQUE/onConflict on
      url → two same-url diff-title items both pass, second silently dropped
      (news-repository.ts:41).
- [ ] S4 null-dated items starved by order-by-DESC + LIMIT (news-repository.ts:53);
      future-dated item leads the digest (rss-source.ts:88).

## Next

- [ ] Golden-set eval: fixed item set → synthesis → automatic scoring (every
      claim cited? no dropped sources?) — prompt changes are unfalsifiable
      without it. Requires an API key.
- [ ] Full zod validation of config (the strict `int()` already covers the
      typo case).
- [ ] Litestream continuous replication (`db:backup` covers the basic case).
- [ ] Pinned base image digest + trivy scan in CI; multi-arch (amd64 + arm64).
- [ ] OG image generation for posts (shareability).
- [ ] Analytics feedback loop — which posts/topics perform, to tune the prompt.

## Backlog (when needed)

- [ ] Batches API for LLM calls (flat −50% cost) — once call volume grows.
- [ ] Verification pass against hallucinations (cheap second call: "does every
      claim have a covering source?").
- [ ] Semantic clustering with embeddings — if sources grow past ~30 feeds.
- [ ] drizzle-kit migrations instead of bootstrap DDL — once the schema stabilizes.
- [ ] Pruning of old news_items (cron) — data grows slowly, not urgent.
- [ ] LinkedIn API integration for direct publishing (now: copy-paste from
      `/api/posts?kind=linkedin`).
- [ ] Review/approval workflow UI (now: publish/unpublish via API).
