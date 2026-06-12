# Best practices research — AI news aggregation & synthesis pipelines

Research date: 2026-06-12. Findings below are mapped to what kiko implements
(✅), what is documented as a future lever (🔜), and what was rejected (❌).

## 1. News aggregation pipelines

| Practice                                                                   | Status     | Notes                                                                                                                                                                                        |
| -------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dedupe at ingestion time (URL + normalized-content hash)                   | ✅         | `src/ingest/dedupe.ts` — sha256 over normalized title + canonical URL (tracking params stripped).                                                                                            |
| Cluster same-story coverage before the LLM                                 | ✅         | `src/ingest/cluster.ts` — greedy Jaccard (≥ 0.5) on title tokens. Industry reports 20–40% prompt-size reduction, and prevents the model from over-weighting stories that many feeds covered. |
| One broken source must not kill the run                                    | ✅         | `Promise.allSettled` per feed, failures logged and skipped.                                                                                                                                  |
| Freshness window                                                           | ✅         | `MAX_ITEM_AGE_DAYS` (default 3) at ingest.                                                                                                                                                   |
| Recency ranking with multi-source coverage as significance signal          | ✅         | Items sorted by `published_at`; clusters expose "also covered by" so the model treats multi-feed coverage as significance.                                                                   |
| Publisher authority scores, semantic-embedding clustering, personalization | ❌ for now | Overkill at 8 curated feeds; title-token Jaccard is enough. Revisit if the source list grows past ~30 feeds (then: embeddings + HAC).                                                        |

Sources:
[How World Monitor aggregates 435+ feeds](https://docs.bswen.com/blog/2026-03-16-news-aggregation-system/),
[Production-ready LLM news aggregator write-up](https://medium.com/@lijoraju/how-i-built-a-production-ready-llm-news-aggregator-from-scratch-015ebd08d566),
[Google News system design guide](https://www.systemdesignhandbook.com/guides/google-news-system-design/),
[awesome-ai-news](https://github.com/taielab/awesome-ai-news)

## 2. Grounded synthesis (anti-hallucination)

| Practice                                             | Status | Notes                                                                                                                                                  |
| ---------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ICE prompting: Instructions, Constraints, Escalation | ✅     | Synthesis prompt: "use ONLY provided items", "skip rather than pad", explicit conflict handling.                                                       |
| Mandatory inline citations to the provided corpus    | ✅     | Every claim carries `[n]` matching input numbering; numbering maps to stored `item_ids`.                                                               |
| Constrain to retrieved/provided text only            | ✅     | Prompt-level; grounding alone doesn't eliminate hallucination (GDELT), hence the "skip rather than pad" escalation rule.                               |
| Multi-document over-weighting of repeated stories    | ✅     | Solved structurally by clustering (one entry per story), not just by prompting.                                                                        |
| Self-evaluation / second-pass verification           | 🔜     | A cheap verification pass ("does every claim have a citation that supports it?") is the next quality lever if hallucinations are observed in practice. |

Sources:
[Microsoft: mitigating LLM hallucinations](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/best-practices-for-mitigating-hallucinations-in-large-language-models-llms/4403129),
[GDELT: why grounding alone doesn't work](https://blog.gdeltproject.org/hallucinating-detail-in-simple-summaries-why-llm-grounding-doesnt-work-to-combat-hallucination/),
[How LLMs hallucinate in multi-document summarization](https://arxiv.org/pdf/2410.13961),
[FACTS Grounding benchmark](https://deepmind.google/blog/facts-grounding-a-new-benchmark-for-evaluating-the-factuality-of-large-language-models/)

## 3. LinkedIn post format (2026)

| Practice                                                                            | Status | Notes                                                                            |
| ----------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------- |
| 1300–2000 chars (sweet spot), < 500 reads as low-effort, hard cap 3000              | ✅     | Prompt targets 1300–2000, hard max 2900 (safety margin).                         |
| Hook must survive the ~210-char mobile truncation                                   | ✅     | Prompt: first line works standalone.                                             |
| 3–5 hashtags, at the bottom, acting as SEO keywords (hashtag-following was removed) | ✅     | Prompt + `hashtags` field in the schema.                                         |
| External links suppress reach → first comment                                       | ✅     | Schema has `firstComment`; body is link-free by rule.                            |
| "Knowledge and advice" framing favored by the algorithm                             | ✅     | Prompt: practitioner sharing what matters to people building software.           |
| End with a question to drive early comments                                         | ✅     | Early comment velocity compounds reach (respond within ~30 min when publishing). |
| Plain text only (LinkedIn renders no markdown)                                      | ✅     | Prompt + schema description.                                                     |

Sources:
[LinkedIn post best practices 2026](https://connectsafely.ai/articles/linkedin-post-best-practices-guide-2026),
[Ideal post length (2026 data)](https://www.wordcountertool.net/blog/ideal-linkedin-post-length),
[LinkedIn hashtags 2026](https://sproutsocial.com/insights/linkedin-hashtags/),
[Character limits guide](https://www.powerin.io/blog/linkedin-post-character-limit)

## 4. Token-spend optimization

| Practice                                                           | Status     | Notes                                                                                                                                                                                                               |
| ------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Avoid the call entirely (dedupe, min-items guard)                  | ✅         | The cheapest token is the one never sent.                                                                                                                                                                           |
| Input shrinking: trimmed summaries, no URLs in prompts, clustering | ✅         | Input tokens dominate this workload.                                                                                                                                                                                |
| Output shrinking: structured outputs instead of prose              | ✅         | Industry case studies report up to 85% output-token reduction vs free-form.                                                                                                                                         |
| Derive secondary content from primary output                       | ✅         | LinkedIn post generated from the ~1K-token digest, not the full item list.                                                                                                                                          |
| Per-call usage tracking                                            | ✅         | Stored per post, aggregated at `GET /api/usage`.                                                                                                                                                                    |
| Effort parameter as a per-call spend knob                          | ✅         | `LLM_EFFORT` env (low/medium/high/max).                                                                                                                                                                             |
| Prompt caching                                                     | ❌ for now | System prompts ≪ 4096-token minimum cacheable prefix for `claude-opus-4-8`; runs are ~24h apart vs 5min–1h TTL. A `cache_control` marker would be a silent no-op. Revisit if full article bodies enter the context. |
| Batches API (flat 50% discount, stacks with caching)               | 🔜         | Perfect fit (latency-insensitive), but at 2 calls/day the absolute savings don't justify polling complexity yet. First lever to pull when volume grows.                                                             |
| Model routing (cheap model for cheap steps)                        | 🔜         | `ANTHROPIC_MODEL` is already configurable; switching tiers is a deliberate quality/cost trade-off left to the operator.                                                                                             |

Sources:
[LLM cost optimization: routing, caching, batching](https://www.maviklabs.com/blog/llm-cost-optimization-2026),
[5 levers to cut API spend](https://www.morphllm.com/llm-cost-optimization),
[10 strategies to reduce LLM costs](https://www.uptech.team/blog/how-to-reduce-llm-costs),
[8 ways to reduce LLM API costs](https://techsy.io/en/blog/reduce-llm-api-costs-guide)
