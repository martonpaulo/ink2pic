/** Results are shown six at a time, in a 2 x 3 grid (brief section 8.4). */
export const PAGE_SIZE = 6;

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

/** The items of page `index` (0-based); an index past the end gives an empty page. */
export function pageOf<T>(items: readonly T[], index: number): T[] {
  return items.slice(index * PAGE_SIZE, (index + 1) * PAGE_SIZE);
}
