import type { NewSource } from '../db/sources-repository.js';

function decodeXmlEntities(s: string): string {
  return s
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&apos;', "'");
}

const attr = (tag: string, name: string): string | undefined => new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(tag)?.[1];

/**
 * Extract feeds from an OPML file (the standard feed-reader export format).
 * Every `<outline ... xmlUrl="...">` becomes a source; the title/text attribute
 * is the name, falling back to the URL. Regex-based on purpose — OPML is flat and
 * this avoids pulling in an XML parser for a one-shot import.
 */
export function parseOpml(xml: string): NewSource[] {
  const out: NewSource[] = [];
  for (const m of xml.matchAll(/<outline\b[^>]*\bxmlUrl="([^"]+)"[^>]*>/gi)) {
    const url = decodeXmlEntities(m[1]!).trim();
    if (!/^https?:\/\//i.test(url)) continue;
    const name = attr(m[0], 'title') ?? attr(m[0], 'text');
    out.push({ name: name ? decodeXmlEntities(name).trim() : url, url });
  }
  return out;
}

/**
 * Parse a plain list: one feed per line as `Name | https://url` or just a bare
 * `https://url` (name = url). Blank lines and `#` comments are ignored; only
 * http(s) URLs are kept.
 */
export function parseFeedList(text: string): NewSource[] {
  const out: NewSource[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [a, b] = line.includes('|') ? line.split('|', 2) : [line, line];
    const name = a!.trim();
    const url = b!.trim();
    if (/^https?:\/\//i.test(url)) out.push({ name: name || url, url });
  }
  return out;
}
