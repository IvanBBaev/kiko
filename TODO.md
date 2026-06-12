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
