/**
 * Near-duplicates on the measured pages (#89): two thumbnails whose perceptual hashes
 * (`PerceptualHash.java`) differ in at most DUPLICATE_BITS bits, with about the same shape and
 * tone, are one picture, and the page shows it once. The order the measures gave decides which
 * stays: the earlier one has the higher `einkScore` with the pixel score. A later copy that is
 * clearly cleaner, with fewer edge pixels (specks, JPEG noise), takes the earlier one's place.
 */
import type {Measures} from './measures';
import type {SearchResult} from './types';

/**
 * At most this many of the hash's 192 bits differ between copies: a resized or re-encoded copy
 * differs in a few, a different picture in dozens (PerceptualHashTest). DEFAULT: TO TEST on the
 * lab's pages.
 */
export const DUPLICATE_BITS = 12;
/** Copies have the same aspect ratio within this share. */
const ASPECT_SHARE = 0.1;
/** And the same mean gray within this many grays, 0 to 255. */
const MEAN_GRAYS = 16;
/** A later copy is cleaner when its edge share is lower by this much. */
const CLEANER_EDGE = 0.02;
const HEX = 16;
const NIBBLE_BITS = 4;

/** Bits that differ between two hex hashes; Infinity when their lengths differ. */
export function hashDistance(a: string, b: string): number {
  if (a.length !== b.length) {
    return Infinity;
  }
  const binary = (hash: string) =>
    [...hash]
      .map(digit => parseInt(digit, HEX).toString(2).padStart(NIBBLE_BITS, '0'))
      .join('');
  const x = binary(a);
  const y = binary(b);
  let bits = 0;
  for (let i = 0; i < x.length; i++) {
    if (x[i] !== y[i]) {
      bits++;
    }
  }
  return bits;
}

/** Whether two measured thumbnails show the same picture. */
export function sameMeasuredPicture(a: Measures, b: Measures): boolean {
  if (!a.hash || !b.hash) {
    return false;
  }
  const aspect = a.width / a.height;
  const other = b.width / b.height;
  return (
    hashDistance(a.hash, b.hash) <= DUPLICATE_BITS &&
    Math.abs(aspect - other) <= ASPECT_SHARE * Math.max(aspect, other) &&
    Math.abs(a.mean - b.mean) <= MEAN_GRAYS
  );
}

/**
 * `results` with each near-duplicate shown once, in the place of its first copy. Results without
 * a hash are kept as they are. A canonical result is never removed or replaced; a copy of it is.
 */
export function dropNearDuplicates(
  results: readonly SearchResult[],
  measures: ReadonlyMap<string, Measures>,
): SearchResult[] {
  const kept: SearchResult[] = [];
  for (const result of results) {
    const m = measures.get(result.id);
    const at = m
      ? kept.findIndex(earlier => {
          const e = measures.get(earlier.id);
          return e !== undefined && sameMeasuredPicture(e, m);
        })
      : -1;
    if (at < 0) {
      kept.push(result);
      continue;
    }
    const earlier = kept[at];
    const e = measures.get(earlier.id) as Measures;
    if (
      !earlier.canonical &&
      (result.canonical || (m as Measures).edge < e.edge - CLEANER_EDGE)
    ) {
      kept[at] = result;
    }
  }
  return kept;
}
