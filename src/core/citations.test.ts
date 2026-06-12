import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findInvalidCitations } from './citations.js';

describe('findInvalidCitations', () => {
  it('accepts citations within range', () => {
    assert.deepEqual(findInvalidCitations('A [1] and B [2], again [1].', 3), []);
  });

  it('flags out-of-range and zero citations', () => {
    assert.deepEqual(findInvalidCitations('Valid [2], broken [7] and [0].', 3), [0, 7]);
  });

  it('deduplicates and sorts', () => {
    assert.deepEqual(findInvalidCitations('[9] [9] [5]', 2), [5, 9]);
  });

  it('handles bodies with no citations', () => {
    assert.deepEqual(findInvalidCitations('No refs here.', 5), []);
  });
});
