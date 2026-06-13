import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { OgCardData } from '../core/types.js';
import { SatoriOgRenderer } from './satori-renderer.js';

const renderer = new SatoriOgRenderer();

const card: OgCardData = {
  title: 'GPT-6 ships: what changed',
  summary: 'A two-sentence teaser that should wrap nicely across the card.',
  kind: 'site',
  sourceCount: 3,
  createdAt: '2026-06-13T07:00:00.000Z',
};

describe('SatoriOgRenderer', () => {
  it('vectorizes all text to <path> (no <text>, so no system-font dependency)', async () => {
    const svg = await renderer.renderSvg(card);
    assert.ok((svg.match(/<path/g) ?? []).length > 0, 'expected vectorized glyph paths');
    assert.equal((svg.match(/<text/g) ?? []).length, 0, 'expected no live <text> nodes');
  });

  it('vectorizes Cyrillic glyphs too (bundled subset covers Cyrillic)', async () => {
    const svg = await renderer.renderSvg({ ...card, title: 'Тест на кирилица' });
    assert.ok((svg.match(/<path/g) ?? []).length > 0);
    assert.equal((svg.match(/<text/g) ?? []).length, 0);
  });

  it('renders a 1200x630 PNG', async () => {
    const png = await renderer.render(card);
    assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], 'PNG magic bytes');
    assert.equal(png.readUInt32BE(16), 1200, 'IHDR width');
    assert.equal(png.readUInt32BE(20), 630, 'IHDR height');
    assert.ok(png.length > 1000);
  });

  it('renders the null/blank matrix without throwing', async () => {
    const png = await renderer.render({ title: null, summary: null, kind: 'linkedin', sourceCount: 0, createdAt: 'x' });
    assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  });
});
