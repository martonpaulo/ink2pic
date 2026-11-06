/**
 * Orders mixed results so the most typical picture of the word comes first (#43): a simple
 * drawing of the thing, then its canonical pictures (Wikidata's flag, logo and image), then the
 * rest; logos, maps, diagrams and other stylised graphics last (brief sections 5.4, 7 and 8.4).
 * Every signal is one the sources already return: no request per result.
 */
import type {SearchResult} from '../sources/types';

const LINE_WORK =
  /\b(engraving|etching|woodcut|drawing|line ?art|sketch|outline|silhouette|illustration|clip ?art|icon|lithograph)\b/i;
const PHOTO = /\b(photo|photograph|picture of)\b/i;
/** Graphics that are about the word but are not a picture of it (#43). */
const STYLISED =
  /\b(logo|wordmark|maps?|diagrams?|charts?|graphs?|elections?|anatomy|structure|coat of arms|coa|herald(ry|ic)|flags?|emblem|signature|poster|screenshot|quote|qr code|pattern|frame|wireframe|3d|ai generated|chatgpt|gradient)\b/i;
const LINE_FORMATS = new Set(['image/png', 'image/svg+xml']);
/** Title words that say how the thing is drawn, not what else is in the picture. */
const FORM_WORDS = new Set([
  'svg',
  'png',
  'clipart',
  'clip',
  'art',
  'icon',
  'vector',
  'drawing',
  'line',
  'outline',
  'silhouette',
  'simple',
  'sketch',
  'black',
  'white',
  'of',
  'the',
  'a',
  'an',
]);
/** A title naming the word with at most this many other words is a picture of the thing alone. */
const PLAIN_SUBJECT_WORDS = 1;

const LINE_WORK_SCORE = 1;
const FORMAT_SCORE = 1;
const CLIPART_SCORE = 1;
const PHOTO_SCORE = -1;
/** Below a photo that names the word: these are about it, not a picture of it. */
const STYLISED_SCORE = -5;
const MENTION_SCORE = 1;
const PLAIN_SUBJECT_SCORE = 3;

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(word => word !== '' && !/^\d+$/.test(word));
}

/** Whether `word` is `queryWord` or its plural. */
function sameWord(word: string, queryWord: string): boolean {
  return (
    word === queryWord || word === `${queryWord}s` || word === `${queryWord}es`
  );
}

/** How directly the title names the word: 0 not at all, else the mention or plain-subject score. */
function subjectScore(title: string, query: string): number {
  const wanted = words(query);
  const have = words(title);
  if (
    wanted.length === 0 ||
    !wanted.every(q => have.some(word => sameWord(word, q)))
  ) {
    return 0;
  }
  const others = new Set(
    have.filter(
      word => !FORM_WORDS.has(word) && !wanted.some(q => sameWord(word, q)),
    ),
  );
  return others.size <= PLAIN_SUBJECT_WORDS
    ? PLAIN_SUBJECT_SCORE
    : MENTION_SCORE;
}

export function einkScore(result: SearchResult, query = ''): number {
  let score = subjectScore(result.title, query);
  if (LINE_WORK.test(result.title)) {
    score += LINE_WORK_SCORE;
  }
  if (PHOTO.test(result.title)) {
    score += PHOTO_SCORE;
  }
  if (STYLISED.test(result.title)) {
    score += STYLISED_SCORE;
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
 * page mixes both. `lists` holds each source's results in its own rank order. Canonical
 * results keep their own order and follow the best-ranked other result, so page 1 holds both
 * the simple drawing and, for a person, the real portrait (#43). A picture two sources return
 * is shown once.
 */
export function rankForEink(
  lists: readonly SearchResult[][],
  query = '',
): SearchResult[] {
  const interleaved: SearchResult[] = [];
  const longest = Math.max(0, ...lists.map(list => list.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      if (i < list.length) {
        interleaved.push(list[i]);
      }
    }
  }
  const canonical = interleaved.filter(result => result.canonical);
  const [best, ...rest] = interleaved
    .filter(result => !result.canonical)
    .map((result, order) => ({result, order, score: einkScore(result, query)}))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(entry => entry.result);
  const ordered = best ? [best, ...canonical, ...rest] : canonical;
  const seen = new Set<string>();
  return ordered.filter(result => !seen.has(result.id) && seen.add(result.id));
}
