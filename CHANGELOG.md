# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/). No release has been cut yet — everything lives
under Unreleased until 0.1.0 is tagged.

## [Unreleased]

### Added

- Ingestion pipeline: parallel RSS fetch with conditional GET (ETag /
  If-Modified-Since), content-hash dedupe, same-story clustering (Jaccard).
- Claude synthesis of a cited site digest post (structured outputs, adaptive
  thinking, grounding rules) and a LinkedIn-formatted post derived from it.
- Ports & adapters architecture: pluggable `NewsSource` / `DigestSynthesizer` /
  `PostGenerator` registries, repository layer, DI'd `Pipeline`.
- REST API: posts (list/search/detail/publish/unpublish/regenerate), news items,
  pipeline trigger, runs, usage, deep health, own RSS feed, OpenAPI spec.
- Hardening: helmet, rate limit, CORS, optional bearer auth (timing-safe),
  JSON schema validation, unified error shape.
- Reliability: stale-run sweep, graceful shutdown with run drain, LLM
  timeout/retries, boot catch-up run, webhook notifications.
- Observability: shared pino logger, per-post and per-run token accounting,
  prompt versioning, deterministic citation check.
- Ops: Dockerfile + compose, online SQLite backup CLI, CI matrix
  (ubuntu + macos) with unified check gate, Dependabot (grouped, monthly).
