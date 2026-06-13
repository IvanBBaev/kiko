import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bool, int } from './config.js';

describe('int', () => {
  it('returns the fallback for unset/empty', () => {
    assert.equal(int('X', undefined, 5), 5);
    assert.equal(int('X', '', 5), 5);
  });

  it('parses a valid integer', () => {
    assert.equal(int('X', '42', 0), 42);
  });

  it('throws on a non-integer', () => {
    assert.throws(() => int('X', '3.14', 0), /not an integer/);
    assert.throws(() => int('X', 'abc', 0), /not an integer/);
  });

  it('throws below the minimum', () => {
    assert.throws(() => int('X', '-1', 0), /below the minimum/);
    assert.throws(() => int('PORT', '0', 3000, 1), /below the minimum/);
  });
});

describe('bool', () => {
  it('returns the fallback for unset/empty', () => {
    assert.equal(bool('X', undefined, true), true);
    assert.equal(bool('X', '', false), false);
  });

  it('accepts recognized truthy/falsy spellings case-insensitively', () => {
    for (const v of ['true', '1', 'yes', 'on', 'TRUE', 'On']) assert.equal(bool('X', v, false), true);
    for (const v of ['false', '0', 'no', 'off', 'FALSE', 'Off']) assert.equal(bool('X', v, true), false);
  });

  it('throws on an unrecognized value instead of silently coercing to false', () => {
    assert.throws(() => bool('FLAG', 'maybe', false), /not a boolean/);
  });
});
