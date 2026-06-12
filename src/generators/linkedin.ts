import { createHash } from 'node:crypto';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { config } from '../config.js';
import type { PostGenerator } from '../core/ports.js';
import type { GeneratedPost, StoryCluster, SynthesisOutcome } from '../core/types.js';
import { extractUsage, getAnthropicClient } from '../llm/client.js';
import { log } from '../log.js';

const LinkedInPostSchema = z.object({
  text: z
    .string()
    .describe(
      'Complete LinkedIn post: plain text only (no markdown), short paragraphs separated by blank lines, ' +
        'hook in the first line, hashtags at the very end. Target 1300-2000 chars, hard max 2900.',
    ),
  hashtags: z.array(z.string()).describe('The 3-5 hashtags used in the post, each starting with #'),
  firstComment: z
    .string()
    .describe('Suggested first comment containing the source links (links stay out of the post body)'),
});

const LINKEDIN_SYSTEM_PROMPT = `You turn an AI-news digest into a LinkedIn post for a software professional's personal profile.

Format rules:
- Plain text only — LinkedIn renders no markdown. Short paragraphs (1-2 lines) separated by blank lines; unicode bullets (•, →) are fine.
- The first line is the hook and must work standalone: readers see only ~210 characters before "...see more" on mobile. Make it concrete and curiosity-driving, not clickbait.
- Target 1300-2000 characters total (the engagement sweet spot), never exceed 2900.
- Pick the 2-3 most interesting developments, not everything — depth over coverage.
- Frame it as knowledge-sharing from a practitioner: what happened AND why it matters to people building software. First person, no corporate tone, 0-3 emoji max.
- No external links in the post body (links suppress reach); put them in firstComment instead, and only the links for the stories you actually featured.
- End with one short question or discussion prompt to invite comments.
- Exactly 3-5 specific hashtags at the very end (they act as SEO keywords, not discovery tags): #AI plus more specific ones matching the content.
- Do not invent facts that are not in the digest.

Write the post in language: ${config.languages.linkedin} (translate from the digest's language if they differ).`;

const LINKEDIN_PROMPT_VERSION = createHash('sha256').update(LINKEDIN_SYSTEM_PROMPT).digest('hex').slice(0, 8);

/**
 * LinkedIn output channel. Derives the post from the already-synthesized
 * digest instead of re-reading all news items (small input, tailored prompt).
 * Source URLs are passed separately so they land in firstComment, not the body.
 */
export class LinkedInPostGenerator implements PostGenerator {
  readonly kind = 'linkedin';

  // Factory keeps construction lazy (no API key needed at boot) and injectable in tests.
  constructor(private readonly clientFactory: () => ReturnType<typeof getAnthropicClient> = getAnthropicClient) {}

  async generate(synthesis: SynthesisOutcome, clusters: StoryCluster[]): Promise<GeneratedPost> {
    const client = this.clientFactory();
    const { post: digest } = synthesis;

    const sourceLinks = clusters.map((c, i) => `[${i + 1}] ${c.primary.url}`).join('\n');
    const userContent =
      `<digest_post>\n# ${digest.title}\n\n${digest.body}\n</digest_post>\n\n` +
      `<source_links>\n${sourceLinks}\n</source_links>\n\n` +
      `Write the LinkedIn post based on this digest.`;

    const response = await client.messages.parse({
      model: config.llm.model,
      max_tokens: config.llm.maxOutputTokens,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: config.llm.effort,
        format: zodOutputFormat(LinkedInPostSchema),
      },
      system: LINKEDIN_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    });

    if (response.stop_reason === 'refusal') {
      throw new Error('LinkedIn generation request was refused by the model');
    }
    if (response.stop_reason === 'max_tokens') {
      throw new Error(
        `LinkedIn generation hit the max_tokens cap (${config.llm.maxOutputTokens}) — output is truncated; raise LLM_MAX_OUTPUT_TOKENS`,
      );
    }
    if (!response.parsed_output) {
      throw new Error(`LinkedIn generation returned no parseable output (stop_reason: ${response.stop_reason})`);
    }

    const parsed = response.parsed_output;
    if (parsed.text.length > 3000) {
      log.warn(
        { chars: parsed.text.length },
        "generated LinkedIn post is over LinkedIn's 3000 char limit — trim before publishing",
      );
    }

    return {
      kind: this.kind,
      title: digest.title,
      slug: null,
      summary: null,
      body: parsed.text,
      firstComment: parsed.firstComment,
      hashtags: parsed.hashtags,
      usage: extractUsage(response.usage),
      promptVersion: LINKEDIN_PROMPT_VERSION,
    };
  }
}
