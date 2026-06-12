import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NewsItem } from '../db/schema.js';
import { clusterItemIds, clusterItems } from './cluster.js';

let nextId = 1;
function item(title: string, source: string): NewsItem {
  return {
    id: nextId++,
    title,
    source,
    url: `https://example.com/${nextId}`,
    summary: null,
    contentHash: '',
    publishedAt: null,
    fetchedAt: '',
    status: 'new',
  };
}

describe('clusterItems', () => {
  it('merges the same story from different outlets', () => {
    const clusters = clusterItems([
      item('OpenAI releases GPT-6 with new reasoning mode', 'TechCrunch'),
      item('OpenAI launches GPT-6 featuring new reasoning capabilities', 'The Verge'),
    ]);
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0]!.duplicates.length, 1);
  });

  it('keeps distinct stories separate', () => {
    const clusters = clusterItems([
      item('OpenAI releases GPT-6 with new reasoning mode', 'TechCrunch'),
      item('EU passes new AI regulation framework', 'MIT TR'),
      item('Anthropic announces Claude Fable 5', 'HF'),
    ]);
    assert.equal(clusters.length, 3);
  });

  it('uses the first (freshest) item as cluster primary', () => {
    const first = item('OpenAI releases GPT-6 with new reasoning mode', 'TechCrunch');
    const second = item('OpenAI launches GPT-6 featuring new reasoning capabilities', 'The Verge');
    const clusters = clusterItems([first, second]);
    assert.equal(clusters[0]!.primary.id, first.id);
  });

  it('clusterItemIds returns all involved ids', () => {
    const items = [
      item('OpenAI releases GPT-6 with new reasoning mode', 'TechCrunch'),
      item('OpenAI launches GPT-6 featuring new reasoning capabilities', 'The Verge'),
      item('EU passes new AI regulation framework', 'MIT TR'),
    ];
    const ids = clusterItemIds(clusterItems(items));
    assert.deepEqual([...ids].sort((a, b) => a - b), items.map((i) => i.id).sort((a, b) => a - b));
  });

  it('handles empty input', () => {
    assert.deepEqual(clusterItems([]), []);
  });
});
