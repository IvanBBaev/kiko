import type { NewsItem } from '../db/schema.js';
import type { StoryCluster } from '../core/types.js';

// A fixed, version-controlled set of input stories so synthesis quality is
// measured against the SAME material every run — the precondition that makes
// prompt changes falsifiable. Edit deliberately; a change here changes the
// baseline. Dates are fixed (no Date.now) so runs are reproducible.

function item(id: number, source: string, title: string, summary: string, publishedAt: string): NewsItem {
  return {
    id,
    source,
    title,
    url: `https://example.com/${id}`,
    summary,
    contentHash: `hash-${id}`,
    publishedAt,
    fetchedAt: publishedAt,
    status: 'new',
  };
}

function story(primary: NewsItem, duplicates: NewsItem[] = []): StoryCluster {
  return { primary, duplicates };
}

export interface GoldenCase {
  name: string;
  clusters: StoryCluster[];
}

export const GOLDEN_SET: GoldenCase[] = [
  {
    name: 'typical-day',
    clusters: [
      story(
        item(
          1,
          'OpenAI',
          'OpenAI releases GPT-6 with native tool use',
          'GPT-6 adds built-in tool calling and a larger context window; available to API customers today.',
          '2026-06-12T08:00:00.000Z',
        ),
        [
          item(
            101,
            'The Verge',
            'GPT-6 is here',
            'Coverage of the GPT-6 launch and its agentic features.',
            '2026-06-12T09:00:00.000Z',
          ),
        ],
      ),
      story(
        item(
          2,
          'Hugging Face',
          'Open-weights model matches frontier performance on reasoning',
          'A new open-weights model reports parity with closed frontier models on math and coding benchmarks.',
          '2026-06-12T07:30:00.000Z',
        ),
      ),
      story(
        item(
          3,
          'TechCrunch',
          'AI infrastructure startup raises $400M Series C',
          'The round values the inference-optimization startup at $3B; led by a major growth fund.',
          '2026-06-12T06:00:00.000Z',
        ),
      ),
      story(
        item(
          4,
          'MIT Technology Review',
          'EU finalizes guidance on general-purpose AI obligations',
          'Regulators publish implementation guidance clarifying transparency duties for large model providers.',
          '2026-06-12T05:00:00.000Z',
        ),
      ),
      story(
        item(
          5,
          'Simon Willison',
          'Notes on running the new open model locally',
          'A practical write-up of quantization and tooling for the new open-weights release on consumer hardware.',
          '2026-06-12T10:00:00.000Z',
        ),
      ),
      story(
        item(
          6,
          'VentureBeat',
          'Survey: enterprises shift AI budgets to agents',
          'A vendor survey reports growing enterprise spend on agentic workflows over single-prompt assistants.',
          '2026-06-12T04:00:00.000Z',
        ),
      ),
    ],
  },
  {
    name: 'conflicting-sources',
    clusters: [
      story(
        item(
          1,
          'Reuters',
          'Chipmaker says new accelerator ships in Q3',
          'The company states its next-gen AI accelerator will ship in the third quarter.',
          '2026-06-11T08:00:00.000Z',
        ),
      ),
      story(
        item(
          2,
          'Bloomberg',
          'Report: accelerator launch slips to Q4',
          'Supply-chain sources reportedly indicate the same accelerator has slipped to the fourth quarter.',
          '2026-06-11T09:00:00.000Z',
        ),
      ),
      story(
        item(
          3,
          'The Information',
          'Lab open-sources safety evaluation suite',
          'A research lab releases its internal safety-evaluation benchmark under an open license.',
          '2026-06-11T07:00:00.000Z',
        ),
      ),
      story(
        item(
          4,
          'Ars Technica',
          'New training method cuts compute for fine-tuning',
          'Researchers describe a method that reportedly reduces fine-tuning compute substantially.',
          '2026-06-11T06:00:00.000Z',
        ),
      ),
    ],
  },
];
