import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseFeedList, parseOpml } from './opml.js';

describe('parseOpml', () => {
  it('extracts feeds with names from outlines', () => {
    const xml = `<opml><body>
      <outline text="Alpha" title="Alpha" type="rss" xmlUrl="https://a.example/feed"/>
      <outline title="Beta &amp; Co" xmlUrl="https://b.example/rss"></outline>
    </body></opml>`;
    const feeds = parseOpml(xml);
    assert.deepEqual(feeds, [
      { name: 'Alpha', url: 'https://a.example/feed' },
      { name: 'Beta & Co', url: 'https://b.example/rss' },
    ]);
  });

  it('falls back to the URL when no title/text, and skips non-feed outlines', () => {
    const xml = `<opml><body>
      <outline text="Folder"></outline>
      <outline xmlUrl="https://c.example/atom"/>
      <outline title="Bad" xmlUrl="ftp://nope/feed"/>
    </body></opml>`;
    assert.deepEqual(parseOpml(xml), [{ name: 'https://c.example/atom', url: 'https://c.example/atom' }]);
  });
});

describe('parseFeedList', () => {
  it('parses name|url and bare-url lines, ignoring comments/blanks/non-http', () => {
    const text = ['# my feeds', '', 'Alpha | https://a.example/feed', 'https://b.example/rss', 'not a url', '  '].join(
      '\n',
    );
    assert.deepEqual(parseFeedList(text), [
      { name: 'Alpha', url: 'https://a.example/feed' },
      { name: 'https://b.example/rss', url: 'https://b.example/rss' },
    ]);
  });
});
