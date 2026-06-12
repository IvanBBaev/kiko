/**
 * Deterministic (LLM-free) citation check: every inline [n] reference in a
 * digest body must point at an existing source story (1 <= n <= sourceCount).
 * Returns the distinct invalid reference numbers, ascending.
 */
export function findInvalidCitations(body: string, sourceCount: number): number[] {
  const invalid = new Set<number>();
  for (const match of body.matchAll(/\[(\d{1,3})\]/g)) {
    const n = Number(match[1]);
    if (n < 1 || n > sourceCount) invalid.add(n);
  }
  return [...invalid].sort((a, b) => a - b);
}
