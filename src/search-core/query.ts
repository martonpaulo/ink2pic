/**
 * The query pipeline: small stages from what the person typed to what the sources and the ranker
 * read. Each stage is a pure function.
 */

/**
 * The query as a lookup sends it: NFC, one space between words, no punctuation at its ends. The
 * case is kept: search APIs ignore it, and a title lookup would break on a lowered one (#71).
 */
export function normalise(query: string): string {
  return query
    .normalize('NFC')
    .replace(/\s+/gu, ' ')
    .replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, '');
}

const HAN = /\p{Script=Han}/u;

/**
 * The languages a lookup tries, in order: a query in Han script goes to Chinese first when the
 * list holds it; a query with no Han character skips Chinese (#71).
 */
export function lookupLanguages(
  query: string,
  languages: readonly string[],
): string[] {
  if (HAN.test(query)) {
    return languages.includes('zh')
      ? ['zh', ...languages.filter(lang => lang !== 'zh')]
      : [...languages];
  }
  return languages.filter(lang => lang !== 'zh');
}

/** The query's words, lowercased, without numbers or punctuation. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(word => word !== '' && !/^\d+$/.test(word));
}

/** Whole words or phrases of any script, case-insensitive: «logo» in «Apple_logo.svg». */
function wordPattern(alternatives: string): RegExp {
  return new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`,
    'iu',
  );
}

/**
 * The ways a picture can be drawn or made that a person may ask for by name (#65). A group the
 * query names is wanted; any other is judged by the ranker as usual.
 */
export const STYLE_GROUPS = {
  logo: wordPattern('logos?|wordmarks?'),
  flag: wordPattern('flags?'),
  map: wordPattern('maps?'),
  diagram: wordPattern('diagrams?|charts?|graphs?'),
  photo: wordPattern('photos?|photographs?|picture of'),
  painting: wordPattern('paintings?|portraits?'),
  drawing: wordPattern(
    'drawings?|sketch(?:es)?|line ?art|outlines?|contours?|colou?ring(?: pages?)?',
  ),
  icon: wordPattern('icons?'),
  // Decorative frames and borders: Openclipart «Apple Runner» is a frame (#65).
  frame: wordPattern('frames?|borders?|runners?|ornaments?|dividers?'),
  // Text-only pictures: quotes set as posters, lettering (#65, in en, pt and es).
  text: wordPattern(
    'text|words?|quotes?|quotations?|lettering|typography|calligraphy|citação|citações|cita|citas|frases?',
  ),
  signature: wordPattern(
    'signatures?|signatur|firma|assinatura|unterschrift|autographs?',
  ),
} as const;

export type StyleGroup = keyof typeof STYLE_GROUPS;

/** What the ranker reads of a query. */
export type QueryIntent = {
  /** The words that name the thing. */
  subject: string[];
  /** The style groups the query names. */
  styles: ReadonlySet<StyleGroup>;
};

/**
 * Splits the query into subject words and style words: «apple logo» is the subject «apple» in
 * the style «logo». A query of style words only («logo») keeps them as its subject.
 */
export function readIntent(query: string): QueryIntent {
  const styles = new Set<StyleGroup>();
  let rest = query;
  for (const group of Object.keys(STYLE_GROUPS) as StyleGroup[]) {
    const global = new RegExp(STYLE_GROUPS[group].source, 'giu');
    if (global.test(rest)) {
      styles.add(group);
      rest = rest.replace(global, ' ');
    }
  }
  const subject = words(rest);
  return {subject: subject.length > 0 ? subject : words(query), styles};
}

/** Whether the title carries a style group's word. */
export function hasStyle(title: string, group: StyleGroup): boolean {
  return STYLE_GROUPS[group].test(title);
}

/** A single word this long or longer may be cut short («elephan»): its prefix is searched. */
const PREFIX_MINIMUM = 4;

/**
 * What an empty search tries after the sources' own suggestions, cheapest first (#71): a single
 * word as a prefix (`elephan*`, which Commons reads as a wildcard), a phrase by its longest word.
 */
export function fallbackQueries(query: string): string[] {
  const all = normalise(query).split(' ').filter(Boolean);
  if (all.length === 1) {
    const [word] = all;
    return [...word].length >= PREFIX_MINIMUM && !word.endsWith('*')
      ? [`${word}*`]
      : [];
  }
  const longest = all.reduce(
    (best, word) => ([...word].length > [...best].length ? word : best),
    '',
  );
  return longest ? [longest] : [];
}

/**
 * The question and filler words a written line may open with, per query language (#87): «Quem
 * foi Miguel de Cervantes» asks for «Miguel de Cervantes». Longest first is not needed: every
 * phrase that matches the line's start is tried, and the longest one is cut.
 */
export const QUESTION_WORDS: Readonly<Record<string, readonly string[]>> = {
  en: [
    'who was', 'who is', 'who were', 'who are', "who's",
    'what was', 'what is', 'what are', 'what were', "what's",
    'where is', 'where was', 'where are', 'tell me about', 'show me',
  ],
  pt: [
    'quem foi', 'quem é', 'quem era', 'quem são', 'quem foram',
    'o que é', 'o que são', 'o que era', 'que é', 'qual é',
    'onde fica', 'onde é', 'onde está', 'me mostre',
  ],
  es: [
    'quién fue', 'quien fue', 'quién es', 'quien es', 'quién era', 'quien era',
    'qué es', 'que es', 'qué son', 'que son', 'cuál es', 'cual es',
    'dónde está', 'donde esta', 'dónde queda', 'donde queda', 'muéstrame',
  ],
  zh: ['谁是', '什么是', '哪里是', '介绍一下'],
};

/** The line without the question words it opens with, in the given languages (#87). */
export function stripQuestion(
  line: string,
  languages: readonly string[],
): string {
  let rest = normalise(line);
  const phrases = languages.flatMap(lang => QUESTION_WORDS[lang] ?? []);
  for (;;) {
    const lower = rest.toLocaleLowerCase();
    const cut = phrases
      .filter(
        phrase =>
          lower.startsWith(phrase) &&
          (HAN.test(phrase) || !/[\p{L}\p{N}]/u.test(lower[phrase.length] ?? '')),
      )
      .reduce((longest, phrase) => Math.max(longest, phrase.length), 0);
    if (cut === 0) {
      return rest;
    }
    rest = normalise(rest.slice(cut));
  }
}

/** The longest word group of a line that is tried as one name (#87). */
export const MAX_PHRASE_WORDS = 4;

/**
 * The line's trailing word groups, longest first, ending with the last word (#87): «Miguel de
 * Cervantes», then «Cervantes». A group of two words or more starts with a capital letter, so
 * «de Cervantes», «uma banana» and «a China» are never tried. shortcut: the capital marks a name
 * only in scripts with case, and only when the recognition keeps it; read the device logs when a
 * name is missed.
 */
export function trailingGroups(line: string): string[] {
  const tokens = normalise(line)
    .split(' ')
    .map(token => normalise(token))
    .filter(Boolean);
  const groups: string[] = [];
  for (let n = Math.min(tokens.length, MAX_PHRASE_WORDS); n > 1; n--) {
    const group = tokens.slice(-n);
    if (/^\p{Lu}/u.test(group[0])) {
      groups.push(group.join(' '));
    }
  }
  return tokens.length > 0 ? [...groups, tokens[tokens.length - 1]] : [];
}
