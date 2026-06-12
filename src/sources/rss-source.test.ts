import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { safeIsoDate, stripHtml } from './rss-source.js';

describe('stripHtml', () => {
  it('removes tags and entities', () => {
    assert.equal(stripHtml('<p>Hello &amp; <b>world</b>&nbsp;!</p>'), 'Hello world !');
  });

  it('handles uppercase entities and collapses whitespace', () => {
    assert.equal(stripHtml('A &AMP; B\n\n  C'), 'A B C');
  });
});

describe('safeIsoDate', () => {
  it('parses a valid date to ISO', () => {
    assert.equal(safeIsoDate('2026-06-12T07:00:00Z'), '2026-06-12T07:00:00.000Z');
  });

  it('returns null for garbage input instead of throwing', () => {
    assert.equal(safeIsoDate('not a date'), null);
  });

  it('returns null for undefined/empty', () => {
    assert.equal(safeIsoDate(undefined), null);
    assert.equal(safeIsoDate(''), null);
  });
});
