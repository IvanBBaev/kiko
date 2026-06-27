---
layout: home

hero:
  name: kiko
  text: AI news, synthesized.
  tagline: A backend that collects AI news from a curated registry of sources, synthesizes the latest developments with Claude into site digest posts and LinkedIn-ready posts, and serves them over a REST API.
  actions:
    - theme: brand
      text: Architecture
      link: /ARCHITECTURE
    - theme: alt
      text: Product state
      link: /PRODUCT_STATE
    - theme: alt
      text: View on GitHub
      link: https://github.com/IvanBBaev/kiko

features:
  - title: Ports & adapters
    details: Every replaceable capability — news sources, synthesizer, output channels — sits behind an interface and is wired in exactly one composition root. Add a source or a channel by implementing one contract.
  - title: Grounded synthesis
    details: RSS items are deduped and clustered, then synthesized by Claude into digests with source citations. The expensive synthesis call is the artifact; the pipeline is built around token-spend discipline.
  - title: One service, SQLite-backed
    details: Fastify REST API over better-sqlite3 + drizzle-orm, with an FTS5 search index, OG card rendering and an own RSS feed. The consuming site is a separate project.
---

## What this site is

This is the documentation for **kiko**. It explains the architecture, the design
decisions behind it, and the current product state.

- **[Architecture](/ARCHITECTURE)** — module map, pipeline flow and the plug-in contract.
- **[Database analysis](/db-analysis)** — why SQLite now, and the triggers to move off it.
- **[Best practices research](/best-practices)** — the research behind the design decisions.
- **[Product state](/PRODUCT_STATE)** — what works today, a metrics snapshot and known gaps.

The code lives at [github.com/IvanBBaev/kiko](https://github.com/IvanBBaev/kiko).
