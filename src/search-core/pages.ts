// The page size lives with the sources, which size their requests by it (#60).
import {PAGE_SIZE} from './types';

export {PAGE_SIZE};

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

/** The items of page `index` (0-based); an index past the end gives an empty page. */
export function pageOf<T>(items: readonly T[], index: number): T[] {
  return items.slice(index * PAGE_SIZE, (index + 1) * PAGE_SIZE);
}

/**
 * Page 1 is thin when it is not full, empty included: the one rule for when a search tries the
 * suggested spelling (#84) and when the screen says a source did not answer (#82).
 */
export function isThin(count: number): boolean {
  return count < PAGE_SIZE;
}
