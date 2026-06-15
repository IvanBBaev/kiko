# TODO

> **Execution policy:** items are worked top-to-bottom within a section unless
> stated otherwise. Every item ends with the quality gates green
> (`npm run check`) and a commit. Finished items move to [DONE.md](DONE.md)
> with the date and commit hash. Keep statuses truthful.

## Blocked on external factors

- [ ] First real pipeline run against the Anthropic API — requires
      `ANTHROPIC_API_KEY` in `.env`, then `npm run pipeline`. The non-LLM half
      is verified against live feeds; the synthesis path is unit-tested with a
      mocked client only. Run `npm run eval` alongside it: the golden-set harness
      and scorer are shipped (DONE), only the live LLM call needs the key.
- [ ] `docker compose up --build` runtime smoke — CI now builds the image on
      every push (the `docker` job), so the build itself is covered; this item
      is only the local end-to-end run, which needs a running Docker daemon.
- [ ] External uptime monitoring on `/health` (UptimeRobot / healthchecks.io) —
      needs an account.

## Code review residuals (2026-06-13)

28 of 30 review findings fixed across five batches (see DONE.md). Two residuals
need a deeper change or external infra:

- [ ] R3b schema is defined twice (drizzle `schema.ts` + raw DDL in `client.ts`)
      — drift risk. The real fix is drizzle-kit migrations (see backlog); the
      FTS dead-code half (R3a) is done.
- [ ] A7 the public cache window after unpublish is mitigated (cut 300s → 60s),
      but true invalidation needs a CDN purge hook on publish/unpublish — only
      relevant once a CDN is in front of the API.

## Next

- [ ] **First real `npm run pipeline` against the Anthropic API** (mode
      `anthropic`) — the one blocker; read the merged result critically (readable?
      citations valid? grounded? would-publish LinkedIn?). Everything below waits
      on this. `SYNTHESIS_MODE=none` already serves raw items with zero LLM.
- [ ] `SYNTHESIS_MODE=local` — Ollama adapter behind `DigestSynthesizer` (degraded
      but valid citation handling; not symmetric with Anthropic SDK). Only after
      the anthropic synthesis is verified readable — don't run two unproven paths.
- [ ] On-demand social posts **per news (cluster), not per digest**: LinkedIn (re-input),
      Twitter/X (single vs short thread), Facebook (conversational). Each a
      `PostGenerator` + registry line. DECIDED: synchronous response backed by a
      **content cache keyed (news × channel × language)** — no per-user history,
      no PII (independent of the identity question). Build after synthesis is proven.
- [ ] Relevance ranking before synthesis — now that ingestion is data-driven and
      can scale to hundreds/thousands of sources, recency+cluster won't surface
      the best items from tens of thousands/day. Score/LLM-rank to pick top-N
      before the digest. Becomes mandatory as the source set grows toward 1500.
- [ ] Grow the source registry toward 1500 via `sources import` (OPML bundles /
      awesome-AI-RSS lists); health auto-disable prunes dead feeds. Pair with
      retention + relevance ranking before going that wide.
- [ ] Litestream continuous replication (`db:backup` covers the basic case).

## Backlog (when needed)

- [ ] Batches API for LLM calls (flat −50% cost) — once call volume grows.
- [ ] Verification pass against hallucinations (cheap second call: "does every
      claim have a covering source?").
- [ ] Semantic clustering with embeddings — if sources grow past ~30 feeds.
- [ ] drizzle-kit migrations instead of bootstrap DDL — once the schema stabilizes.
- [ ] Retention cron for old `news_items` and `post_events` (+ periodic VACUUM).
      `news_items` grows slowly, but `post_events` is fed by a public unauthenticated
      write (`POST /api/posts/:id/events`), bounded today only by the global rate
      limiter — add retention before high-volume production. Optionally gate that
      endpoint behind an `ANALYTICS_TOKEN` and/or batch events if abuse appears.
- [ ] LinkedIn API integration for direct publishing (now: copy-paste from
      `/api/posts?kind=linkedin`).
- [ ] Review/approval workflow UI (now: publish/unpublish via API).
- [ ] Full zod rewrite of config — optional; `int()`/`bool()`/`oneOf()` already
      reject every value that can be wrong, so this is ergonomics, not coverage.
- [ ] Publish kiko's own multi-arch image (buildx amd64+arm64) — only once there
      is a registry to push to; today the service is built from source via compose.
- [ ] OG image server-side cache + ETag/304 — now rendered per request with a 60s
      `Cache-Control` and the global rate limit; an LRU keyed by post id+status (or
      an `updatedAt` column) would skip the recompute and add conditional GET.
- [ ] Boot-time OG smoke render — surface a native-binary/libc mismatch at startup
      (non-fatal warning) instead of on the first `/og/posts/:id.png` request.
- [ ] Couple `*_LANGUAGE` to OG font coverage — validate the configured language
      against the bundled subset (Latin/Greek/Cyrillic), or add a Noto fallback for
      other scripts. Documented as a known limitation for now.
