import type { PostGenerator } from '../core/ports.js';
import type { GeneratedPost, SynthesisOutcome } from '../core/types.js';

/**
 * The digest itself, published as a site post. No extra LLM call — the
 * synthesis usage is attributed to this post.
 */
export class SitePostGenerator implements PostGenerator {
  readonly kind = 'site';

  async generate(synthesis: SynthesisOutcome): Promise<GeneratedPost> {
    const { post, usage, promptVersion } = synthesis;
    return {
      kind: this.kind,
      title: post.title,
      slug: post.slug,
      summary: post.summary,
      body: post.body,
      firstComment: null,
      hashtags: null,
      topics: post.topics,
      usage,
      promptVersion,
    };
  }
}
