/**
 * Orders mixed results so pictures that render well in 16 grays come first: line art,
 * engravings and clip art before photos (brief sections 7 and 8.4).
 */
import type {SearchResult} from '../sources/types';

const LINE_WORK =
  /\b(engraving|etching|woodcut|drawing|line ?art|sketch|outline|silhouette|illustration|clip ?art|icon|lithograph)\b/i;
const PHOTO = /\b(photo|photograph|picture of)\b/i;
const LINE_FORMATS = new Set(['image/png', 'image/svg+xml']);

const LINE_WORK_SCORE = 2;
const FORMAT_SCORE = 1;
const CLIPART_SCORE = 1;
const PHOTO_SCORE = -1;

export function einkScore(result: SearchResult): number {
  let score = 0;
  if (LINE_WORK.test(result.title)) {
    score += LINE_WORK_SCORE;
  }
  if (PHOTO.test(result.title)) {
    score += PHOTO_SCORE;
  }
  if (result.source === 'openclipart') {
    // Every Openclipart result is a PNG of vector clip art: one bonus, not two, so ties with
    // Commons line work stay possible and the first page mixes both.
    score += CLIPART_SCORE;
  } else if (result.mime && LINE_FORMATS.has(result.mime)) {
    score += FORMAT_SCORE;
  }
  return score;
}

/**
 * Sorts by score; ties keep each source's own order and alternate the sources, so the first
 * page mixes both. `lists` holds each source's results in its own rank order.
 */
export function rankForEink(lists: readonly SearchResult[][]): SearchResult[] {
  const interleaved: SearchResult[] = [];
  const longest = Math.max(0, ...lists.map(list => list.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      if (i < list.length) {
        interleaved.push(list[i]);
      }
    }
  }
  return interleaved
    .map((result, order) => ({result, order, score: einkScore(result)}))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(entry => entry.result);
}
