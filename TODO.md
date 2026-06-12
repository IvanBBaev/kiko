# TODO

Работен бек лог на проекта. Нова задача → секция **TODO**. Готова задача → мести се в
**DONE** с дата. Поддържа се от AI асистента, но всеки може да добавя.

---

## TODO

### Към "110% работещ и използваем"
- [ ] Първи реален pipeline run срещу Anthropic API (изисква `ANTHROPIC_API_KEY` в `.env`) —
      не-LLM половината е верифицирана на живо; остава само LLM частта

### Троен анализ на липсите (2026-06-12)

**Анализ 1 — функционални липси:**
- [ ] `POST /api/posts/:id/regenerate` — прегенериране на LinkedIn пост от съществуващ
      digest (евтин call, без нов synthesis); полезно при незадоволителен резултат
- [ ] Известяване при `error`/`partial` run (Telegram/email/webhook) — сега грешката
      се вижда само ако някой погледне `/api/runs`
- [ ] Персистентни feed validators (ETag/Last-Modified в БД) — сега са in-memory
      и се губят при рестарт (малка загуба, но е една колона)

**Анализ 2 — операционни липси:**
- [ ] `git init` + CI (GitHub Actions: typecheck + test при всеки push) — проектът
      все още не е git repo!
- [ ] Backup стратегия: Litestream (continuous replication) или cron копие на `data/`
- [ ] External uptime monitoring на `/health` (UptimeRobot/healthchecks.io)
- [ ] Boot-time предупреждение: scheduler enabled + липсващ `ANTHROPIC_API_KEY`
      сега гърми чак в 07:00 (тихо), вместо при старт
- [ ] `docker build` smoke — Dockerfile-ът никога не е build-ван реално

**Анализ 3 — продуктови липси (за сайта):**
- [ ] Webhook/събитие към сайта при publish — сайтът да не polling-ва `/api/posts`
- [ ] FTS5 търсене endpoint (`/api/posts/search?q=`) — SQLite го дава безплатно
- [ ] Двуезични постове (напр. bg за сайта + en за LinkedIn) — сега `POSTS_LANGUAGE`
      е един за всички канали; става per-generator конфигурация
- [ ] RSS feed на самия kiko (`/feed.xml`) — агрегаторът иронично няма собствен фийд
- [ ] OG image генерация за постовете (споделяемост)
- [ ] Analytics feedback loop — кои постове/теми работят, за да се тунира промптът

### Дълбок анализ за 11/10 (2026-06-12)

Изводи от четене на целия сорс (не генерични съвети). Предпоставка: блокерите от
"Троен анализ" по-горе (git+CI, реален LLM run, docker smoke) са преди всичко тук.

**Надеждност / recovery:**
- [ ] Boot-time sweep на забити run-ове — умре ли процесът по средата, редът в `runs`
      остава `running` завинаги (guard-ът е in-memory, рестартът го губи):
      `UPDATE runs SET status='error', error='interrupted' WHERE status='running'`
- [ ] Graceful shutdown да маркира/изчаква текущия run — сега `process.exit(0)` в
      `index.ts` убива LLM call по средата; + `sqlite.close()` за чист WAL checkpoint
- [ ] Изрични `timeout`/`maxRetries` на Anthropic клиента — adaptive thinking +
      16k max_tokens е потенциално дълъг call; SDK дефолтите не са тунинговани
      за непривиден batch pipeline
- [ ] Catch-up run при boot — сървър down в 07:00 значи без digest до утре; ако
      последният успешен run е по-стар от cron интервала → trigger (съществуващите
      guards пазят от двоен token spend)

**Сигурност:**
- [ ] `requireAuth`: timing-safe сравнение (`crypto.timingSafeEqual`) вместо `!==`
      на bearer токена
- [ ] Fastify JSON schema валидация на query/params — сега ръчни guards;
      `/api/news?status=каквото-и-да-е` минава мълчаливо; schema дава и бърза
      сериализация безплатно

**API контракт (сайтът е отделен проект — трябва му договор):**
- [ ] OpenAPI спецификация (`@fastify/swagger`) — генерира се от schema валидацията
- [ ] Pagination metadata в `/api/posts` (`total`/`hasMore`) — гол масив не стига
      за UI пагинация
- [ ] Единен документиран error формат (сега ад-хок `{error: string}`)

**Наблюдаемост:**
- [ ] Един pino instance за Fastify и pipeline (сега два несвързани — `log.ts` и
      Fastify logger); ниво от env, pretty в dev / JSON в prod
- [ ] "Дълбок" `/health`: последен run (статус + възраст), следващ cron fire —
      истинският liveness въпрос за cron-driven сървис е "тече ли pipeline-ът",
      не "отговаря ли SELECT 1"

**LLM качество (инженерно, не "на око"):**
- [ ] Детерминистична citation проверка след synthesis (безплатна, без LLM):
      всяко `[n]` в body да резолвва към реален source (n ≤ брой клъстери);
      счупена референция → warn/fail преди запис
- [ ] Golden-set eval: фиксиран набор items → synthesis → автоматичен скоринг
      (всяко твърдение цитирано? без изпуснати source-ове?) — без това промпт
      промените са нефалсифицируеми
- [ ] Prompt versioning: hash/версия на промпта в `posts`/`runs` — качеството да
      се корелира с промпт редакции

**Качествени гейтове:**
- [ ] ESLint (type-checked) + Prettier + гейт в CI (върви с git init от
      операционния анализ)
- [ ] Coverage (c8) + праг; unit тестове за `formatClustersForPrompt` и
      generator-ите с mock client — LLM слоят сега е с 0% покритие
- [ ] Zod-валидиран config при boot — `int()` мълчаливо подменя typo с дефолт;
      невалиден `PIPELINE_CRON` гърми чак при schedule, не при старт
- [ ] Dependabot/Renovate + `npm audit` гейт в CI

**Deploy (надграждане над docker build smoke):**
- [ ] `docker-compose.yml` — volume, env_file, restart policy; по-късно Litestream
      sidecar за backup-а
- [ ] Pinned base image digest + trivy scan в CI; multi-arch (amd64 + arm64)

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
