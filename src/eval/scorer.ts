import { findInvalidCitations } from '../core/citations.js';
import { CANONICAL_TOPICS, type SitePost, type StoryCluster } from '../core/types.js';

export interface EvalThresholds {
  /** Fraction of input stories that must be cited at least once. */
  minSourceCoverage: number;
  minWords: number;
  maxWords: number;
}

export const DEFAULT_THRESHOLDS: EvalThresholds = { minSourceCoverage: 0.6, minWords: 500, maxWords: 1100 };

export interface EvalScore {
  citationCount: number;
  invalidCitations: number[];
  /** Has citations and none of them point outside the source range. */
  citationsValid: boolean;
  totalSources: number;
  coveredSources: number;
  sourceCoverage: number;
  wordCount: number;
  lengthInRange: boolean;
  citationDensityPer100Words: number;
  /** Heuristic: a bullet list appears near the top (the prompted TL;DR). */
  hasTldr: boolean;
  topicCount: number;
  topicsCanonical: boolean;
  /** True when no hard-gate dimension failed. */
  pass: boolean;
  failures: string[];
}

const CANONICAL = new Set<string>(CANONICAL_TOPICS);

function citedRefs(body: string): number[] {
  return [...body.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
}

function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

function detectTldr(body: string): boolean {
  const lines = body
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 12);
  return lines.some((l) => /^[-*•]\s+/.test(l));
}

/**
 * Deterministic, LLM-free quality scoring of a synthesized digest against its
 * input stories — the falsifiable half of the golden-set eval. Checks grounding
 * (citations resolve), source coverage (no dropped stories), citation density,
 * length, TL;DR presence, and topic tagging. Hard gates: valid citations,
 * coverage, length, at least one topic. TL;DR and canonical-topic adherence are
 * reported as signals but don't fail the post.
 */
export function scorePost(
  post: SitePost,
  clusters: StoryCluster[],
  thresholds: EvalThresholds = DEFAULT_THRESHOLDS,
): EvalScore {
  const totalSources = clusters.length;
  const refs = citedRefs(post.body);
  const invalidCitations = findInvalidCitations(post.body, totalSources);
  const citationCount = refs.length;
  const citationsValid = citationCount > 0 && invalidCitations.length === 0;

  const coveredSources = new Set(refs.filter((n) => n >= 1 && n <= totalSources)).size;
  const sourceCoverage = totalSources > 0 ? coveredSources / totalSources : 0;

  const words = wordCount(post.body);
  const lengthInRange = words >= thresholds.minWords && words <= thresholds.maxWords;
  const citationDensityPer100Words = words > 0 ? (citationCount / words) * 100 : 0;

  const topicCount = post.topics.length;
  const topicsCanonical = topicCount > 0 && post.topics.every((t) => CANONICAL.has(t));

  const failures: string[] = [];
  if (!citationsValid) {
    failures.push(`citations invalid (count=${citationCount}, out-of-range=[${invalidCitations.join(',')}])`);
  }
  if (sourceCoverage < thresholds.minSourceCoverage) {
    failures.push(
      `source coverage ${coveredSources}/${totalSources} below ${(thresholds.minSourceCoverage * 100).toFixed(0)}%`,
    );
  }
  if (!lengthInRange) failures.push(`word count ${words} outside ${thresholds.minWords}-${thresholds.maxWords}`);
  if (topicCount < 1) failures.push('no topics assigned');

  return {
    citationCount,
    invalidCitations,
    citationsValid,
    totalSources,
    coveredSources,
    sourceCoverage,
    wordCount: words,
    lengthInRange,
    citationDensityPer100Words,
    hasTldr: detectTldr(post.body),
    topicCount,
    topicsCanonical,
    pass: failures.length === 0,
    failures,
  };
}
