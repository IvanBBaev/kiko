import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { slugify } from './slugify.js';

describe('slugify', () => {
  it('lowercases and hyphenates words', () => {
    assert.equal(slugify('Hello World'), 'hello-world');
  });

  it('strips slashes, punctuation and diacritics', () => {
    assert.equal(slugify('A/B: Ñoño!'), 'a-b-nono');
  });

  it('collapses and trims hyphens', () => {
    assert.equal(slugify('  --a---b--  '), 'a-b');
  });

  it('returns empty when nothing usable remains', () => {
    assert.equal(slugify('日本語'), '');
  });

  it('caps the length', () => {
    assert.ok(slugify('x'.repeat(200)).length <= 80);
  });
});
