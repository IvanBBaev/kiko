import type { OgCardData, PostSourceRef } from '../core/types.js';
import type { Post } from '../db/schema.js';

// Clamp limits keep a pathological title/summary from overflowing the 1200x630
// card. Site titles are written "max ~70 chars" (see SitePostSchema), so these
// caps only ever bite on malformed input.
const MAX_TITLE_CHARS = 110;
const MAX_SUMMARY_CHARS = 150;

/** Parse the JSON `sources` column defensively — a malformed or legacy value
 *  must not 500 the public OG route, so anything non-array degrades to empty. */
function parseSources(raw: string | null): PostSourceRef[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PostSourceRef[]) : [];
  } catch {
    return [];
  }
}

/** Project a stored post row onto the channel-agnostic OG card inputs. */
export function postToCardData(row: Post): OgCardData {
  return {
    title: row.title,
    summary: row.summary,
    kind: row.kind,
    sourceCount: parseSources(row.sources).length,
    createdAt: row.createdAt,
  };
}

/** The fully-resolved text of a card — pure, so every branch is unit-testable. */
export interface CardModel {
  badge: string;
  title: string;
  summary: string | null;
  footer: string;
}

function clamp(value: string, max: number): string {
  // Count and slice by code point, not UTF-16 unit, so an astral char (emoji,
  // surrogate pair) on the boundary is never split into a lone surrogate.
  const cps = [...value];
  return cps.length <= max
    ? value
    : `${cps
        .slice(0, max - 1)
        .join('')
        .trimEnd()}…`;
}

function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  try {
    return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
  } catch {
    // An invalid locale tag (e.g. "en_US" with an underscore) throws RangeError.
    return iso.slice(0, 10);
  }
}

// Explicit per-kind badges with a safe default, so a channel added later
// (e.g. 'x', 'newsletter') is a visible omission to fix rather than a silent
// mislabel under the site badge.
const BADGES: Record<string, string> = { site: 'AI NEWS DIGEST', linkedin: 'LINKEDIN POST' };

export function buildCardModel(card: OgCardData, locale: string): CardModel {
  const title = clamp((card.title ?? '').trim() || 'Untitled', MAX_TITLE_CHARS);
  const trimmedSummary = (card.summary ?? '').trim();
  const summary = trimmedSummary ? clamp(trimmedSummary, MAX_SUMMARY_CHARS) : null;
  const badge = BADGES[card.kind] ?? 'AI NEWS DIGEST';

  const footerParts: string[] = [];
  if (card.sourceCount > 0) footerParts.push(`${card.sourceCount} source${card.sourceCount === 1 ? '' : 's'}`);
  footerParts.push(formatDate(card.createdAt, locale));

  return { badge, title, summary, footer: footerParts.join(' · ') };
}

// --- satori element tree (JSX-free; a plain {type, props} object) ---

type StyleValue = string | number;
export interface OgElement {
  type: string;
  props: { style: Record<string, StyleValue>; children?: OgElement[] | string };
}

function box(style: Record<string, StyleValue>, children: OgElement[] | string): OgElement {
  return { type: 'div', props: { style: { display: 'flex', ...style }, children } };
}

/** Build the 1200x630 card layout for the given resolved model. */
export function buildCardElement(model: CardModel): OgElement {
  const middle: OgElement[] = [box({ fontSize: 56, fontWeight: 700, lineHeight: 1.15 }, model.title)];
  if (model.summary)
    middle.push(box({ fontSize: 28, fontWeight: 400, color: '#b8c0d8', lineHeight: 1.4 }, model.summary));

  return box(
    {
      width: '100%',
      height: '100%',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: 80,
      backgroundColor: '#0b1020',
      color: '#ffffff',
      fontFamily: 'Inter',
    },
    [
      box({ fontSize: 26, fontWeight: 700, color: '#7c9cff', letterSpacing: 1 }, `kiko · ${model.badge}`),
      box({ flexDirection: 'column', gap: 24 }, middle),
      box({ fontSize: 24, fontWeight: 400, color: '#8893ad' }, model.footer),
    ],
  );
}
