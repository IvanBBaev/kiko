/**
 * Curated seed feed list — the quality starting set imported into the `sources`
 * registry via `npm run sources:seed`. The registry is the runtime source of
 * truth (data-driven, grows via `npm run sources:import <opml|list>`); this array
 * is only the initial seed. All entries verified live (200 + valid RSS/Atom).
 *
 * Deliberately curated for signal over count: research labs, reputable AI media,
 * and high-signal practitioners. Research-paper firehoses (arXiv) and noisy
 * aggregators are left out of the seed — add them later once relevance ranking
 * lands, so they don't crowd out news in the recency-based candidate pool.
 */
export const CURATED_FEEDS: ReadonlyArray<readonly [name: string, feedUrl: string]> = [
  // Research labs & companies
  ['OpenAI', 'https://openai.com/news/rss.xml'],
  ['Google AI Blog', 'https://blog.google/technology/ai/rss/'],
  ['Google DeepMind', 'https://deepmind.google/blog/rss.xml'],
  ['Google Research', 'https://research.google/blog/rss/'],
  ['Hugging Face', 'https://huggingface.co/blog/feed.xml'],
  ['Microsoft Research', 'https://www.microsoft.com/en-us/research/feed/'],
  ['AWS Machine Learning', 'https://aws.amazon.com/blogs/machine-learning/feed/'],
  ['NVIDIA Blog', 'https://blogs.nvidia.com/feed/'],
  ['Apple ML Research', 'https://machinelearning.apple.com/rss.xml'],
  ['BAIR (Berkeley)', 'https://bair.berkeley.edu/blog/feed.xml'],
  // Media
  ['The Verge — AI', 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml'],
  ['TechCrunch — AI', 'https://techcrunch.com/category/artificial-intelligence/feed/'],
  ['MIT Technology Review — AI', 'https://www.technologyreview.com/topic/artificial-intelligence/feed'],
  ['VentureBeat — AI', 'https://venturebeat.com/category/ai/feed/'],
  ['Ars Technica — AI', 'https://arstechnica.com/ai/feed/'],
  ['Wired — AI', 'https://www.wired.com/feed/tag/ai/latest/rss'],
  ['The Register — AI', 'https://www.theregister.com/software/ai_ml/headlines.atom'],
  ['IEEE Spectrum — AI', 'https://spectrum.ieee.org/feeds/topic/artificial-intelligence.rss'],
  ['ZDNet — AI', 'https://www.zdnet.com/topic/artificial-intelligence/rss.xml'],
  ['The Guardian — AI', 'https://www.theguardian.com/technology/artificialintelligenceai/rss'],
  ['NYT — Artificial Intelligence', 'https://rss.nytimes.com/services/xml/rss/nyt/ArtificialIntelligence.xml'],
  ['Synced', 'https://syncedreview.com/feed/'],
  ['The Decoder', 'https://the-decoder.com/feed/'],
  ['The Gradient', 'https://thegradient.pub/rss/'],
  ['KDnuggets', 'https://www.kdnuggets.com/feed'],
  ['Towards Data Science', 'https://towardsdatascience.com/feed'],
  ['Machine Learning Mastery', 'https://machinelearningmastery.com/blog/feed/'],
  // High-signal practitioners & newsletters
  ['Simon Willison', 'https://simonwillison.net/atom/everything/'],
  ['Import AI', 'https://importai.substack.com/feed'],
  ['Ahead of AI', 'https://magazine.sebastianraschka.com/feed'],
  ['Sebastian Raschka', 'https://sebastianraschka.com/rss_feed.xml'],
  ['Interconnects', 'https://www.interconnects.ai/feed'],
  ['One Useful Thing', 'https://www.oneusefulthing.org/feed'],
  ['Last Week in AI', 'https://lastweekin.ai/feed'],
  ['Latent Space', 'https://www.latent.space/feed'],
  ["Lil'Log", 'https://lilianweng.github.io/index.xml'],
  ['Sebastian Ruder', 'https://www.ruder.io/rss/'],
  ['Hacker News — AI', 'https://hnrss.org/newest?q=AI+OR+LLM+OR+%22machine+learning%22'],
];
