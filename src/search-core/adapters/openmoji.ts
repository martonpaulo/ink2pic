/**
 * OpenMoji's black outline symbols for abstract words and emotions (#67, brief section 5): the
 * word is matched on the device against a keyword index shipped in the plugin, with no request;
 * only the picture comes from the network. The index is built by
 * `scripts/build-openmoji-index.cjs` from pinned data files (see its header and NOTICE.md).
 */
import type {PictureHost, SourceAdapter, SourceContext} from '../adapter';
import INDEX from '../data/openmoji-index.json';
import {lookupLanguages, normalise} from '../query';
import {PAGE_SIZE, SearchResult, SourceOutcome, sourceId} from '../types';

/** The pinned release's pictures, as the index build recorded them (#99): never `master`. */
const PICTURES = INDEX.pictures;
/** The one size the pictures come in: 618 x 618 PNG, 9.5 to 17 KB (research A). */
export const OPENMOJI_WIDTH = 618;
const LICENSE = 'CC BY-SA 4.0';
const ATTRIBUTION = 'OpenMoji';
/** Symbols offered per search: one page, so they never crowd out the drawings. */
const MAX_RESULTS = PAGE_SIZE;
/** Symbols that lead the page for an abstract word: a choice, not a page of faces. */
const LEADS_ABSTRACT = 2;

/**
 * How well a symbol matches: the name itself, else a word of it, plus each keyword list that holds
 * the word, summed over the languages: a symbol several sources name for the word ranks higher.
 */
const EXACT_NAME = 6;
const NAME_WORD = 3;
const KEYWORD = 2;
const WEAK_KEYWORD = 1;
const ALL_WORDS = 1;

type Words = {
  name: string;
  nameWords: string[];
  /** CLDR's keywords. */
  strong: Set<string>;
  /** Each English list of a lesser source: openmoji_tags, emojilib. */
  weak: Set<string>[];
};
type Emoji = {
  hex: string;
  /** An emotion or a sign: matching it alone makes the query abstract. */
  abstract: boolean;
  title: string;
  byLanguage: Map<string, Words>;
};

const HAN = /\p{Script=Han}/u;

/** Lowercase with accents removed, as the index stores its words: «Frío» is «frio». */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .trim();
}

function parseField(text: string): Words | undefined {
  if (!text) {
    return undefined;
  }
  const [main, ...weak] = text.split('/');
  const [name, ...strong] = main.split(';');
  const folded = fold(name);
  return {
    name: folded,
    nameWords: folded.split(' '),
    strong: new Set(strong),
    weak: weak.map(list => new Set(list.split(';'))),
  };
}

let parsed: Emoji[] | undefined;

/** The index, read on the first search only. */
function symbols(): Emoji[] {
  parsed ??= INDEX.entries.map(line => {
    const [head, ...fields] = line.split('\t');
    const [hex, abstract] = head.split(' ');
    const byLanguage = new Map<string, Words>();
    INDEX.languages.forEach((lang, i) => {
      const words = parseField(fields[i]);
      if (words) {
        byLanguage.set(lang, words);
      }
    });
    return {
      hex,
      abstract: abstract === '1',
      title: fields[0].split(/[;/]/)[0],
      byLanguage,
    };
  });
  return parsed;
}

function nameScore(words: Words, query: string): number {
  if (words.name === query) {
    return EXACT_NAME;
  }
  const inName = HAN.test(query)
    ? words.name.includes(query)
    : words.nameWords.includes(query);
  return inName ? NAME_WORD : 0;
}

function keywordScore(words: Words, query: string): number {
  return (
    (words.strong.has(query) ? KEYWORD : 0) +
    words.weak.filter(list => list.has(query)).length * WEAK_KEYWORD
  );
}

/** A phrase whose every word is a word of the name or a keyword. */
function hasAllWords(words: Words, query: string): boolean {
  const parts = query.split(' ');
  return (
    parts.length > 1 &&
    parts.every(
      part =>
        words.nameWords.includes(part) ||
        words.strong.has(part) ||
        words.weak.some(list => list.has(part)),
    )
  );
}

type Match = {symbol: Emoji; score: number; named: number};

function matchIn(words: Words, query: string): {score: number; named: number} {
  const named = nameScore(words, query);
  const score = named + keywordScore(words, query);
  return {
    score: score || (hasAllWords(words, query) ? ALL_WORDS : 0),
    named,
  };
}

/** The symbols the word names in any of the languages, best first; ties keep OpenMoji's order. */
export function matchSymbols(
  query: string,
  languages: readonly string[],
): Match[] {
  const word = fold(normalise(query));
  if (!word) {
    return [];
  }
  const langs = lookupLanguages(query, languages);
  const matches: Match[] = [];
  for (const symbol of symbols()) {
    let score = 0;
    let named = 0;
    for (const lang of langs) {
      const words = symbol.byLanguage.get(lang);
      if (words) {
        const found = matchIn(words, word);
        score += found.score;
        named = Math.max(named, found.named);
      }
    }
    if (score > 0) {
      matches.push({symbol, score, named});
    }
  }
  return matches.sort((a, b) => b.score - a.score);
}

/**
 * Which matches lead the page (#67): those the word names exactly; else, for an abstract word,
 * the best few. A word is abstract when no thing among the matches carries it in its name:
 * «apple» names the red apple, so the drawings lead; «cold» names only the cold face.
 */
function leaders(matches: readonly Match[]): Set<Match> {
  const exact = matches.filter(match => match.named === EXACT_NAME);
  if (exact.length > 0) {
    return new Set(exact.slice(0, LEADS_ABSTRACT));
  }
  const concrete = matches.some(
    match => !match.symbol.abstract && match.named > 0,
  );
  return new Set(concrete ? [] : matches.slice(0, LEADS_ABSTRACT));
}

/** Every symbol's code, in OpenMoji's order: what «Download symbols» fetches (#91). */
export function symbolHexes(): string[] {
  return symbols().map(symbol => symbol.hex);
}

export function pictureUrl(hex: string): string {
  return `${PICTURES}/${hex}.png`;
}

function toResult(match: Match, leads: boolean): SearchResult {
  const {hex, title} = match.symbol;
  return {
    id: `openmoji:${hex}`,
    source: 'openmoji',
    title,
    thumbUrl: pictureUrl(hex),
    license: LICENSE,
    attribution: ATTRIBUTION,
    mime: 'image/png',
    ...(leads && {leads: true as const}),
  };
}

export async function searchOpenmoji(
  query: string,
  ctx: SourceContext,
): Promise<SourceOutcome> {
  const matches = matchSymbols(query, ctx.languages);
  const lead = leaders(matches);
  return {
    ok: true,
    value: {
      results: matches
        .slice(0, MAX_RESULTS)
        .map(match => toResult(match, lead.has(match))),
    },
  };
}

export const openmojiPictures: PictureHost = {
  url: result => pictureUrl(sourceId(result.id)),
  insertWidth: OPENMOJI_WIDTH,
};

export const openmojiAdapter: SourceAdapter = {
  name: 'openmoji',
  search: searchOpenmoji,
  localIndex: true,
};
