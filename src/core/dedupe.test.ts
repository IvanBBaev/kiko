import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { contentHash } from './dedupe.js';

describe('contentHash', () => {
  it('ignores tracking params and url fragments', () => {
    const a = contentHash('Some Title', 'https://example.com/post?utm_source=rss&ref=x#section');
    const b = contentHash('Some Title', 'https://example.com/post');
    assert.equal(a, b);
  });

  it('normalizes title case, punctuation and whitespace', () => {
    const a = contentHash('OpenAI: releases  GPT-6!', 'https://example.com/p');
    const b = contentHash('openai releases gpt 6', 'https://example.com/p');
    assert.equal(a, b);
  });

  it('differs for different titles', () => {
    const a = contentHash('Title one', 'https://example.com/p');
    const b = contentHash('Title two', 'https://example.com/p');
    assert.notEqual(a, b);
  });

  it('differs for different canonical paths', () => {
    const a = contentHash('Same title', 'https://example.com/a');
    const b = contentHash('Same title', 'https://example.com/b');
    assert.notEqual(a, b);
  });

  it('survives unparseable urls', () => {
    assert.doesNotThrow(() => contentHash('Title', 'not a url'));
  });
});
