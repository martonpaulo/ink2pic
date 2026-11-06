/**
 * Orders mixed results so the most typical picture of the word comes first (#43): a simple
 * drawing of the thing, then its canonical pictures (Wikidata's flag, logo and image), then the
 * rest; logos, maps, diagrams and other stylised graphics last (brief sections 5.4, 7 and 8.4).
 * Every signal is one the sources already return: no request per result.
 */
import {hasStyle, QueryIntent, readIntent, StyleGroup, words} from './query';
import type {SearchResult} from './types';

/**
 * One signal of the ranking: points for a result under the query's intent. The ranker adds the
 * scorers' points; a new signal (pixel measures) is one more scorer, never a change here.
 */
export type Scorer = (result: SearchResult, intent: QueryIntent) => number;

const LINE_WORK =
  /\b(engraving|etching|woodcut|drawing|line ?art|sketch|outline|silhouette|illustration|clip ?art|icon|lithograph)\b/i;
/**
 * Graphics that are about the word but are not a picture of it (#43), beyond the style groups a
 * query can ask for: these are never wanted.
 */
const STYLISED_OTHER =
  /\b(elections?|anatomy|structure|coat of arms|coa|herald(ry|ic)|emblem|poster|screenshot|qr code|pattern|frame|wireframe|3d|ai generated|chatgpt|gradient)\b/i;
/** The style groups that fall with the stylised graphics unless the query asks for them. */
const STYLISED_GROUPS: readonly StyleGroup[] = [
  'logo',
  'flag',
  'map',
  'diagram',
];
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
/** Below a plain photo of the word: the picture is mostly letters (owner, #65). */
const TEXT_SCORE = -4;
/** A title carrying a style the query asks for («apple logo»), per group (#65). */
const ASKED_STYLE_SCORE = 2;
/** Below a photo that names the word: these are about it, not a picture of it. */
const STYLISED_SCORE = -5;
const MENTION_SCORE = 1;
const PLAIN_SUBJECT_SCORE = 3;

/** Whether `word` is `queryWord` or its plural. */
function sameWord(word: string, queryWord: string): boolean {
  return (
    word === queryWord || word === `${queryWord}s` || word === `${queryWord}es`
  );
}

/** How directly the title names the subject: 0 not at all, else the mention or plain-subject score. */
const subjectScorer: Scorer = (result, {subject, styles}) => {
  const have = words(result.title);
  if (
    subject.length === 0 ||
    !subject.every(q => have.some(word => sameWord(word, q)))
  ) {
    return 0;
  }
  const others = new Set(
    have.filter(
      word =>
        !FORM_WORDS.has(word) &&
        !subject.some(q => sameWord(word, q)) &&
        // The style the query asks for is not another thing in the picture: «Apple Inc. logo».
        ![...styles].some(group => hasStyle(word, group)),
    ),
  );
  return others.size <= PLAIN_SUBJECT_WORDS
    ? PLAIN_SUBJECT_SCORE
    : MENTION_SCORE;
};

const lineWorkScorer: Scorer = result =>
  LINE_WORK.test(result.title) ? LINE_WORK_SCORE : 0;

const photoScorer: Scorer = (result, {styles}) =>
  !styles.has('photo') && hasStyle(result.title, 'photo') ? PHOTO_SCORE : 0;

/** One penalty for any stylised graphic the query did not ask for. */
const stylisedScorer: Scorer = (result, {styles}) =>
  STYLISED_OTHER.test(result.title) ||
  STYLISED_GROUPS.some(
    group => !styles.has(group) && hasStyle(result.title, group),
  )
    ? STYLISED_SCORE
    : 0;

const textScorer: Scorer = (result, {styles}) =>
  !styles.has('text') && hasStyle(result.title, 'text') ? TEXT_SCORE : 0;

/** The styles the query asks for, each one the title carries. */
const askedStyleScorer: Scorer = (result, {styles}) =>
  [...styles].filter(group => hasStyle(result.title, group)).length *
  ASKED_STYLE_SCORE;

const formatScorer: Scorer = result => {
  if (result.source === 'openclipart') {
    // Every Openclipart result is a PNG of vector clip art: one bonus, not two, so ties with
    // Commons line work stay possible and the first page mixes both.
    return CLIPART_SCORE;
  }
  return result.mime && LINE_FORMATS.has(result.mime) ? FORMAT_SCORE : 0;
};

/** The ranking's signals, in the order they are read; every scorer sees every result. */
export const DEFAULT_SCORERS: readonly Scorer[] = [
  subjectScorer,
  lineWorkScorer,
  photoScorer,
  stylisedScorer,
  textScorer,
  askedStyleScorer,
  formatScorer,
];

function total(
  result: SearchResult,
  intent: QueryIntent,
  scorers: readonly Scorer[],
): number {
  return scorers.reduce((sum, score) => sum + score(result, intent), 0);
}

export function einkScore(
  result: SearchResult,
  query = '',
  scorers: readonly Scorer[] = DEFAULT_SCORERS,
): number {
  return total(result, readIntent(query), scorers);
}

/** The file name the result's picture comes from, which may say more than its title. */
function fileName(result: SearchResult): string {
  const path = (result.original?.url ?? result.thumbUrl).split('?')[0];
  const name = path.slice(path.lastIndexOf('/') + 1);
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

/**
 * A signature is never a picture of the word: it is left out unless the query asks for one
 * (#65; research of 2026-11-06 found one on every person's page).
 */
function wanted(result: SearchResult, {styles}: QueryIntent): boolean {
  return (
    styles.has('signature') ||
    !(
      hasStyle(result.title, 'signature') ||
      hasStyle(fileName(result), 'signature')
    )
  );
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
  scorers: readonly Scorer[] = DEFAULT_SCORERS,
): SearchResult[] {
  const intent = readIntent(query);
  const interleaved: SearchResult[] = [];
  const longest = Math.max(0, ...lists.map(list => list.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      if (i < list.length) {
        interleaved.push(list[i]);
      }
    }
  }
  const kept = interleaved.filter(result => wanted(result, intent));
  const canonical = kept.filter(result => result.canonical);
  const [best, ...rest] = kept
    .filter(result => !result.canonical)
    .map((result, order) => ({
      result,
      order,
      score: total(result, intent, scorers),
    }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(entry => entry.result);
  const ordered = best ? [best, ...canonical, ...rest] : canonical;
  const seen = new Set<string>();
  return ordered.filter(result => !seen.has(result.id) && seen.add(result.id));
}
