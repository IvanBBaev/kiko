/**
 * URL slug from arbitrary text: ASCII lowercase, diacritics stripped,
 * non-alphanumerics collapsed to single hyphens, trimmed and length-capped.
 * Returns '' if nothing usable remains (the caller picks a fallback). LLM-
 * produced slugs reach storage and feed links, so they must not carry spaces,
 * slashes, or unicode.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, ''); // a trailing hyphen can survive the slice
}
