import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { OgCardData } from '../core/types.js';
import type { Post } from '../db/schema.js';
import { buildCardElement, buildCardModel, postToCardData } from './card.js';

const base: OgCardData = {
  title: 'A real title',
  summary: 'A short summary.',
  kind: 'site',
  sourceCount: 2,
  createdAt: '2026-06-13T07:00:00.000Z',
};

describe('postToCardData', () => {
  it('counts parsed sources and passes fields through', () => {
    const row = {
      title: 'T',
      summary: 'S',
      kind: 'site',
      createdAt: '2026-06-13T00:00:00.000Z',
      sources: JSON.stringify([{ n: 1 }, { n: 2 }, { n: 3 }]),
    } as unknown as Post;
    const card = postToCardData(row);
    assert.equal(card.sourceCount, 3);
    assert.equal(card.title, 'T');
    assert.equal(card.kind, 'site');
  });

  it('treats a null sources column as zero sources', () => {
    const row = {
      title: 'T',
      summary: null,
      kind: 'linkedin',
      createdAt: '2026-06-13',
      sources: null,
    } as unknown as Post;
    assert.equal(postToCardData(row).sourceCount, 0);
  });

  it('degrades malformed or non-array sources to zero instead of throwing', () => {
    const mk = (sources: string) => ({ title: 'T', kind: 'site', createdAt: '2026-06-13', sources }) as unknown as Post;
    assert.equal(postToCardData(mk('{ not json')).sourceCount, 0);
    assert.equal(postToCardData(mk('{"n":1}')).sourceCount, 0); // valid JSON, not an array
  });
});

describe('buildCardModel', () => {
  it('falls back to Untitled for a null or blank title', () => {
    assert.equal(buildCardModel({ ...base, title: null }, 'en').title, 'Untitled');
    assert.equal(buildCardModel({ ...base, title: '   ' }, 'en').title, 'Untitled');
  });

  it('clamps an overly long title with an ellipsis', () => {
    const long = 'x'.repeat(200);
    const { title } = buildCardModel({ ...base, title: long }, 'en');
    assert.ok(title.length < long.length);
    assert.ok(title.endsWith('…'));
  });

  it('clamps astral characters without splitting a surrogate pair', () => {
    const { title } = buildCardModel({ ...base, title: '😀'.repeat(200) }, 'en');
    assert.ok(title.endsWith('…'));
    // A lone surrogate is replaced by U+FFFD on a utf8 round-trip, so an intact
    // round-trip proves the clamp boundary did not split a surrogate pair.
    assert.equal(Buffer.from(title, 'utf8').toString('utf8'), title);
  });

  it('omits a null/blank summary and trims/clamps a present one', () => {
    assert.equal(buildCardModel({ ...base, summary: null }, 'en').summary, null);
    assert.equal(buildCardModel({ ...base, summary: '   ' }, 'en').summary, null);
    assert.equal(buildCardModel({ ...base, summary: '  hi  ' }, 'en').summary, 'hi');
    const longSummary = 'y'.repeat(300);
    assert.ok(buildCardModel({ ...base, summary: longSummary }, 'en').summary!.endsWith('…'));
  });

  it('picks the badge from the post kind, defaulting an unknown kind', () => {
    assert.equal(buildCardModel({ ...base, kind: 'site' }, 'en').badge, 'AI NEWS DIGEST');
    assert.equal(buildCardModel({ ...base, kind: 'linkedin' }, 'en').badge, 'LINKEDIN POST');
    assert.equal(buildCardModel({ ...base, kind: 'twitter' }, 'en').badge, 'AI NEWS DIGEST');
  });

  it('pluralizes the source count and omits it when zero', () => {
    assert.match(buildCardModel({ ...base, sourceCount: 1 }, 'en').footer, /^1 source · /);
    assert.match(buildCardModel({ ...base, sourceCount: 2 }, 'en').footer, /^2 sources · /);
    const noSources = buildCardModel({ ...base, sourceCount: 0 }, 'en').footer;
    assert.doesNotMatch(noSources, /source/);
    assert.match(noSources, /2026/);
  });

  it('formats the date and is timezone-safe on the year', () => {
    assert.match(buildCardModel(base, 'en').footer, /2026/);
  });

  it('falls back to the ISO date for an invalid locale', () => {
    // "en_US" (underscore) is not a valid BCP-47 tag — Intl throws RangeError.
    assert.match(buildCardModel(base, 'en_US').footer, /2026-06-13$/);
  });

  it('falls back to the raw prefix for an unparseable date', () => {
    assert.match(buildCardModel({ ...base, createdAt: 'not-a-date' }, 'en').footer, /not-a-date$/);
  });
});

describe('buildCardElement', () => {
  it('includes a summary node only when a summary is present', () => {
    const withSummary = buildCardElement(buildCardModel(base, 'en'));
    const withoutSummary = buildCardElement(buildCardModel({ ...base, summary: null }, 'en'));
    // root children: [header, middle, footer]; middle holds title (+ summary).
    const middleWith = (withSummary.props.children as { props: { children: unknown[] } }[])[1]!;
    const middleWithout = (withoutSummary.props.children as { props: { children: unknown[] } }[])[1]!;
    assert.equal(middleWith.props.children.length, 2);
    assert.equal(middleWithout.props.children.length, 1);
  });
});
