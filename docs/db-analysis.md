# Database selection analysis

Decision date: 2026-06-12. Current choice: **SQLite (better-sqlite3 + drizzle-orm)**,
with a defined migration path to PostgreSQL. Rationale below.

## Workload profile (what we're actually choosing a DB for)

| Dimension | Reality |
|---|---|
| Write volume | ~100–200 news-item inserts/day, 2 posts/day, a handful of run rows. One writer (the pipeline), never concurrent writes. |
| Read volume | Site API: read-mostly list/detail queries, trivially cacheable (posts change twice a day). |
| Data shape | Small, fully relational: `news_items` → `posts` (via id list), `runs`. JSON-ish fields (hashtags, item ids) are fine as TEXT. |
| Size horizon | Years of operation ≈ tens of MB. Never approaches any engine's limits. |
| Consistency needs | Single-node ACID is plenty; no distributed transactions, no multi-region. |
| Team/ops | Solo project, no DBA, should run on the cheapest possible host. |

This is a textbook small OLTP workload with a single writer — the deciding factors are
**operational overhead** and **future feature needs** (search, embeddings), not raw
capability.

## Candidates

### SQLite (current) — ✅ chosen

- **Zero ops**: in-process, one file, no server, no credentials, no network hop.
  Backup = file copy; continuous replication available via Litestream if needed.
- **Performance**: in-process reads are microseconds; WAL mode gives concurrent
  readers alongside the single writer — exactly our shape.
- **Future features**: FTS5 for site search; `sqlite-vec` for embeddings if semantic
  clustering is ever needed; both without leaving the file.
- **Limits that don't bite here**: one writer at a time (we have one writer);
  single-node only (we have one node).
- **Real constraint**: the app must run on a host with a persistent filesystem
  (VPS, container with volume). Not compatible with serverless/multi-instance
  deployments.

### PostgreSQL — the designated "next" DB, not the first

- Wins when any of these become true: multiple app instances behind a load balancer,
  concurrent writers, managed-DB requirement (Neon/Supabase/RDS), `pgvector` for
  semantic search at scale, heavy relevance-ranked FTS (`tsvector`).
- Costs today: a server to run/patch/back up (or a paid managed tier), connection
  management, network latency on every query — all for capabilities this workload
  doesn't use.
- **Migration cost is deliberately kept low**: drizzle schema is the single source of
  truth — porting is `sqliteTable` → `pgTable` plus type tweaks; queries stay
  identical. Data fits in a single dump/restore.

### libSQL / Turso — the middle path if deployment goes serverless

- SQLite-compatible (drizzle supports it natively), managed hosting, embedded
  replicas. If the future site ends up on Vercel/Cloudflare and the API must follow,
  this is a smaller jump than Postgres: same SQL dialect, same schema.

### Rejected

| Engine | Why not |
|---|---|
| MySQL/MariaDB | No advantage over Postgres for this workload; weaker vector/FTS ecosystem. If we outgrow SQLite, Postgres is the better target. |
| MongoDB | Data is relational and stable-schema; document flexibility solves a problem we don't have, and we'd lose easy joins/aggregates (`/api/usage`). |
| DuckDB | OLAP engine — brilliant for analytics over many rows, wrong for an OLTP API serving single-row lookups. |
| Redis (as primary) | Not a durable system of record; would still need a real DB behind it. As a cache it's unnecessary — posts change twice a day, HTTP caching suffices. |

## Decision matrix

| Criterion (weight) | SQLite | Postgres | Turso/libSQL | MongoDB |
|---|---|---|---|---|
| Ops overhead (high) | ●●● | ● | ●● | ● |
| Fit for single-writer OLTP (high) | ●●● | ●●● | ●●● | ●● |
| Cost at this scale (high) | ●●● | ● | ●● | ● |
| Search/vector future (med) | ●● | ●●● | ●● | ●● |
| Multi-instance scaling (low today) | ● | ●●● | ●●● | ●●● |
| Migration friction later (med) | ●●● (via drizzle) | n/a | ●●● | ● |

## Triggers to revisit (move to Postgres — or Turso if serverless)

1. The API needs **more than one instance** (concurrent writers / no shared disk).
2. Deployment target has **no persistent filesystem** (serverless) → Turso first.
3. **Semantic clustering/search over embeddings** beyond what `sqlite-vec` handles
   comfortably → `pgvector`.
4. A **managed-DB / backup-SLA requirement** appears (product goes serious).

Until one of those fires, every Postgres dollar and admin-hour buys nothing for this
workload.
