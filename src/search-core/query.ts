/**
 * The query pipeline: small stages from what the person typed to what the sources and the ranker
 * read. Each stage is a pure function.
 */

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
  drawing: wordPattern('drawings?|sketch(?:es)?|line ?art'),
  icon: wordPattern('icons?'),
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
