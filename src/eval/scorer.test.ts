import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SitePost, StoryCluster } from '../core/types.js';
import { scorePost } from './scorer.js';

const cluster = (id: number): StoryCluster => ({
  primary: {
    id,
    source: 's',
    title: `t${id}`,
    url: `u${id}`,
    summary: null,
    contentHash: '',
    publishedAt: null,
    fetchedAt: '',
    status: 'new',
  },
  duplicates: [],
});
const clusters = [cluster(1), cluster(2), cluster(3)];

const post = (body: string, topics: string[] = ['models']): SitePost => ({
  title: 't',
  slug: 's',
  summary: 'x',
  body,
  topics,
});

// Low word thresholds keep the fixtures short; coverage stays at the default 0.6.
const TH = { minSourceCoverage: 0.6, minWords: 3, maxWords: 100 };

describe('scorePost', () => {
  it('passes a well-cited, fully-covered, in-range post', () => {
    const s = scorePost(post('Story one [1] and two [2] and three [3] together.'), clusters, TH);
    assert.equal(s.pass, true);
    assert.equal(s.citationsValid, true);
    assert.equal(s.coveredSources, 3);
    assert.equal(s.sourceCoverage, 1);
  });

  it('flags an out-of-range citation', () => {
    const s = scorePost(post('A real [1] and a bogus [5] reference here please.'), clusters, TH);
    assert.equal(s.citationsValid, false);
    assert.deepEqual(s.invalidCitations, [5]);
    assert.equal(s.pass, false);
  });

  it('fails on dropped sources (low coverage)', () => {
    const s = scorePost(post('Only one source cited [1] across the whole digest.'), clusters, TH);
    assert.ok(s.sourceCoverage < 0.6);
    assert.ok(s.failures.some((f) => /coverage/.test(f)));
    assert.equal(s.pass, false);
  });

  it('fails a post with no citations at all', () => {
    const s = scorePost(post('No citations anywhere in this body whatsoever today.'), clusters, TH);
    assert.equal(s.citationCount, 0);
    assert.equal(s.citationsValid, false);
  });

  it('fails an out-of-range word count', () => {
    const s = scorePost(post('[1] [2] [3]'), clusters, { minSourceCoverage: 0.6, minWords: 50, maxWords: 100 });
    assert.equal(s.lengthInRange, false);
    assert.ok(s.failures.some((f) => /word count/.test(f)));
  });

  it('fails when no topics are assigned', () => {
    const s = scorePost(post('All three cited [1] [2] [3] here in the body.', []), clusters, TH);
    assert.ok(s.failures.includes('no topics assigned'));
    assert.equal(s.pass, false);
  });

  it('detects a TL;DR bullet list and flags non-canonical topics', () => {
    const bullets = scorePost(post('- bullet one [1]\n- bullet two [2]\n- bullet three [3]'), clusters, TH);
    assert.equal(bullets.hasTldr, true);
    const nonCanonical = scorePost(post('all cited [1] [2] [3] here', ['made-up-topic']), clusters, TH);
    assert.equal(nonCanonical.topicsCanonical, false);
    assert.equal(nonCanonical.pass, true, 'a non-canonical topic is a signal, not a hard failure');
  });
});
