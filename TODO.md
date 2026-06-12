# TODO

Работен бек лог на проекта. Нова задача → секция **TODO**. Готова задача → мести се в
**DONE** с дата. Поддържа се от AI асистента, но всеки може да добавя.

---

## TODO

### Блокирани от външни фактори

- [ ] Първи реален pipeline run срещу Anthropic API (изисква `ANTHROPIC_API_KEY` в `.env`) —
      не-LLM половината е верифицирана на живо; остава само LLM частта
- [ ] `docker build` smoke — Docker daemon-ът не вървеше на машината; стартирай
      Docker Desktop и: `docker compose up --build`
- [ ] External uptime monitoring на `/health` (UptimeRobot/healthchecks.io) — нужен акаунт
- [ ] GitHub remote + push (repo-то е локално; CI/Dependabot чакат remote)

### Следващи (от "Дълбок анализ за 11/10")

- [ ] Golden-set eval: фиксиран набор items → synthesis → автоматичен скоринг
      (изисква API ключ)
- [ ] Пълна zod валидация на config (строгият int() покри typo случая)
- [ ] Litestream continuous replication (db:backup покрива базовия случай)
- [ ] Pinned base image digest + trivy scan в CI; multi-arch (amd64 + arm64)
- [ ] OG image генерация за постовете (споделяемост)
- [ ] Analytics feedback loop — кои постове/теми работят, за да се тунира промптът

### Бек лог (когато потрябва)

- [ ] Batches API за LLM извикванията (−50% цена) — при нарастване на обема
- [ ] Verification pass срещу халюцинации (евтин втори call: "всяко твърдение има ли покриващ източник?")
- [ ] Семантично клъстериране с embeddings — ако източниците станат > ~30 фийда
- [ ] drizzle-kit миграции вместо bootstrap DDL — когато схемата се стабилизира
- [ ] Pruning на стари news_items (cron) — данните растат бавно, не е спешно
- [ ] LinkedIn API интеграция за директно публикуване (сега: copy-paste от `/api/posts?kind=linkedin`)
- [ ] Преглед/одобрение workflow UI (сега: publish/unpublish през API)

---

## DONE

### 2026-06-12 — Качествени гейтове + OpenAPI (продължение на TODO файла)

- [x] OpenAPI спецификация: `@fastify/swagger` → `GET /openapi.json`, генерирана
      от route schemas (верифицирана на живо)
- [x] ESLint (typescript-eslint, type-checked) + Prettier (printWidth 120) +
      гейт в CI (lint + format:check); 0 lint грешки, целият src нормализиран
- [x] Coverage: c8 (`npm run test:coverage`) — 85.8% statements общо
- [x] Unit тестове за LLM слоя: clientFactory injection в ClaudeSynthesizer и
      LinkedInPostGenerator + 7 нови теста с mock клиент (success/refusal/
      max_tokens/unparseable + formatClustersForPrompt)
- [x] pino-pretty в dev (`npm run dev` пайпва през pino-pretty)

### 2026-06-12 — TODO файлът изработен (троен анализ + дълбок анализ 11/10)

**Функционални:**

- [x] `POST /api/posts/:id/regenerate?kind=` — нов канален пост от съществуващ digest,
      без нов synthesis (клъстерите се реконструират от stored sources)
- [x] Webhook известия (`WEBHOOK_URL`): `run.error`, `run.partial`, `post.published`
- [x] Персистентни feed validators — `feed_validators` таблица, `FeedValidatorStore`
      порт, DB-backed имплементация (in-memory остава дефолт за тестове)

**Надеждност / recovery:**

- [x] Boot-time sweep: забити `running` run-ове → `error: interrupted by restart`
- [x] Graceful shutdown: изчаква активния run до 30s + `sqlite.close()` (чист WAL)
- [x] Изрични `timeout` (10 min) / `maxRetries` (3) на Anthropic клиента (env tunable)
- [x] Catch-up run при boot ако последният run е по-стар от `CATCH_UP_HOURS` (26h
      дефолт; пали се само при наличен API ключ)
- [x] Boot warning: scheduler enabled без ANTHROPIC ключ

**Сигурност / API контракт:**

- [x] `requireAuth` с `crypto.timingSafeEqual`
- [x] Fastify JSON schema валидация на всички query/params (енуми, мин/макс, дефолти)
- [x] Pagination metadata: `total`/`limit`/`offset`/`hasMore` в `/api/posts`
- [x] Единен error формат `{error, statusCode}` (setErrorHandler + setNotFoundHandler)

**Наблюдаемост / LLM качество:**

- [x] Един pino root instance — HTTP е child на pipeline логера; `LOG_LEVEL` env
- [x] Дълбок `/health`: lastRun (статус/възраст), nextScheduledRun, pipelineRunning
- [x] Детерминистична citation проверка след synthesis (warn при счупено `[n]`)
- [x] Prompt versioning: sha256 hash на system промпта в `posts.prompt_version`
- [x] Строг config: невалидна числова env стойност гърми при boot (не тих дефолт)

**Продуктови:**

- [x] FTS5 търсене: `GET /api/posts/search?q=` (виртуална таблица + триггери + rebuild)
- [x] Двуезични постове: `SITE_LANGUAGE` / `LINKEDIN_LANGUAGE` per-generator
- [x] Собствен RSS: `GET /feed.xml` (published site постове, XML-escaped)

**Операционни:**

- [x] `git init` (main) + `.git/info/exclude` за AI файловете + initial commit (52 файла)
- [x] CI workflow (.github/workflows/ci.yml): typecheck + test + build + npm audit
- [x] Dependabot (npm weekly групирано + GitHub Actions monthly)
- [x] `docker-compose.yml` (volume, env_file, restart policy)
- [x] `npm run db:backup` — online SQLite backup (SQLite backup API, безопасен при работа)
- [x] Тестове: 38/38 (нови: citations, search, regenerate, schema validation)

### 2026-06-12 — Дийп ресърч: production hardening (имплементирано)

- [x] SQLite production pragmas: `synchronous=NORMAL`, `busy_timeout=5000`,
      `cache_size=-20000` (20MB) — стандартният durability/speed баланс при WAL
- [x] Fastify hardening: `@fastify/helmet` (security headers) +
      `@fastify/rate-limit` (RATE_LIMIT_MAX, default 120/min/IP)
- [x] Conditional GET за RSS (ETag/If-Modified-Since → 304) — feed polling
      етикет; верифициран на живо срещу TechCrunch (втори fetch → 304 → 0 items)
- [x] `Cache-Control: public, max-age=300` на публичните post GET-ове —
      сайтът/CDN кешира четенията (постовете се сменят 2×/ден)

### 2026-06-12 — Три итерации подобрения + ООП модуларизация

**Итерация 1 — ingest производителност + API DX:**

- [x] `ingestNewItems`: N+1 INSERT в цикъл → един атомарен batch INSERT
- [x] Проверка само на batch хешовете с `inArray` (не цялата таблица в паметта)
- [x] Custom User-Agent за RSS заявките
- [x] API: `itemIds`/`hashtags`/`sources` се връщат парснати, не като JSON стрингове

**Итерация 2 — наблюдаемост:**

- [x] Структурирано логване (pino) в pipeline/sources/generators
- [x] Токени per run: `runs.input_tokens`/`output_tokens` + ensureColumn mini-миграция
- [x] `/api/runs` показва token spend на всеки run; run lifecycle логове

**Итерация 3 — продуктово качество:**

- [x] `posts.sources` колона (JSON: n, title, url, source, alsoCoveredBy) — сайтът
      може да резолвне `[n]` цитатите до URL-и
- [x] Клъстер-капацитет: избира 2× items, клъстерира, реже до max (нерязаните
      остават `new` за следващия run)
- [x] Текущата дата в промпта
- [x] Pipeline тестове с fake портове + реална in-memory БД (5 сценария:
      dedupe, skip guard, ok flow + токени, partial при счупен генератор,
      счупен източник не убива run-а)

**ООП модуларизация (ports & adapters):**

- [x] `core/ports.ts`: NewsSource, DigestSynthesizer, PostGenerator интерфейси
- [x] Класове: RssSource, ClaudeSynthesizer, SitePostGenerator, LinkedInPostGenerator
- [x] Plug-in регистри: `sources/index.ts` и `generators/index.ts` (± един ред)
- [x] Repository класове (News/Posts/Runs); `Pipeline` клас с constructor injection
- [x] Composition root `container.ts` — единственото място с конкретни имплементации
- [x] 29/29 теста, typecheck, build, live ingest, server smoke — зелени

### 2026-06-12 — Към "110% работещ" (итерация 3)

- [x] Верификация на RSS фийдовете — всичките 8 връщат 200 + валиден XML, без промени
- [x] CORS (`@fastify/cors`, `CORS_ORIGINS` env) — сайтът може да консумира API-то от браузър
- [x] Ingest-only CLI (`npm run ingest`) — фийдове → БД без LLM; верифициран на живо
      (55 items, втори run: new: 0 → дедупликацията работи end-to-end)
- [x] Тестове: 24 теста (node:test + tsx) — dedupe, cluster, fetcher utils, routes
      (in-memory SQLite, auth, publish workflow, slug uniqueness); тестът хвана и
      реален бъг: различна нормализация на пунктуация в dedupe vs cluster — уеднаквена
- [x] Production build верифициран (`tsconfig.build.json` без тестове; dist boot-ва чисто)
- [x] Dockerfile (multi-stage, non-root, healthcheck, volume за /app/data) + .dockerignore

### 2026-06-12 — Ревю фиксове (senior + architect)

- [x] Recovery семантика: items → digested веднага след site post; LinkedIn fail → `partial` run (без двоен token spend)
- [x] Безопасно парсване на feed дати; uppercase HTML entities; LinkedIn >3000 chars warning
- [x] max_tokens 8000 → 16000 (adaptive thinking се брои в лимита); explicit `stop_reason=max_tokens` handling
- [x] `ensureUniqueSlug` + partial unique index на `posts.slug`; limit/offset guards
- [x] Publish workflow: `POST /api/posts/:id/publish|unpublish` + `?status` филтър
- [x] Опционална bearer auth (`API_TOKEN`) за мутиращите endpoints
- [x] Graceful shutdown (SIGINT/SIGTERM); `PIPELINE_TZ`; fail-fast валидация на `LLM_EFFORT`; `/health` с DB проверка

### 2026-06-12 — Скелетон + ресърч + DB анализ

- [x] TypeScript/Node 22 скелетон: Fastify, SQLite (better-sqlite3 + drizzle), croner, rss-parser
- [x] Pipeline: fetch → dedupe (sha256) → клъстериране (Jaccard ≥ 0.4) → синтез (Claude structured outputs) → LinkedIn пост → digested
- [x] REST API: posts/news/runs/usage/pipeline-run + health
- [x] Дийп ресърч → `docs/best-practices.md` (клъстериране преди LLM, anti-hallucination ICE, LinkedIn 2026 формат, токен-оптимизация)
- [x] DB анализ → `docs/db-analysis.md` (SQLite сега; тригери за Postgres/Turso)
- [x] Token usage tracking per post + `/api/usage`
