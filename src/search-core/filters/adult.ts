/**
 * Adult and explicit pictures never show (#69): a fixed rule, always on, for every source, with
 * no setting to turn it off (owner, 2026-11-06). It reads only signals the sources already return,
 * so it costs no request per result: the result's title (on Commons, its file name) and, on
 * Commons, the file's categories. A classical nude statue filtered out is an accepted false
 * positive; an explicit picture on page 1 is not (brief section 5.6).
 */
import {words} from '../query';
import type {SearchResult} from '../types';

/**
 * Whole words, lowercase and without accents, in English, Portuguese, Spanish, French, German,
 * Italian and Dutch. Left out on purpose: «nu» (the Greek letter, and Vietnamese «nữ», woman, once
 * accents go), «nudo» (Spanish for knot), «nus» (a university's initials), «breast» and «nipple»
 * (chicken breast, breast cancer, a baby bottle), «erection» (of a building),
 * «xxx» (the Roman numeral).
 */
const ADULT_WORDS = new Set([
  // English
  'nude',
  'nudes',
  'nudity',
  'naked',
  'nakedness',
  'nudism',
  'nudist',
  'nudists',
  'naturism',
  'naturist',
  'topless',
  'toplessness',
  'sex',
  'sexual',
  'sexually',
  'sexy',
  'nsfw',
  'lewd',
  'obscene',
  'penis',
  'penises',
  'penile',
  'phallus',
  'phallic',
  'vulva',
  'vagina',
  'vaginal',
  'clitoris',
  'scrotum',
  'testicles',
  'intercourse',
  'coitus',
  'orgasm',
  'fetish',
  'fetishism',
  'bdsm',
  'striptease',
  'ecchi',
  // Portuguese
  'nua',
  'nuas',
  'nudez',
  'nudismo',
  'nudista',
  'sexo',
  // Spanish
  'desnudo',
  'desnuda',
  'desnudos',
  'desnudas',
  'desnudez',
  'desnudismo',
  // French
  'nue',
  'nues',
  'nudite',
  'sexe',
  'sexuel',
  'sexuelle',
  // German
  'nackt',
  'nackte',
  'nackter',
  'nacktheit',
  'sexuell',
  // Italian
  'nuda',
  'nudi',
  'nudita',
  'sesso',
  'sessuale',
  // Dutch
  'naakt',
]);

/** Word starts that are adult in every word they begin: pornografia, erotica, genitalia. */
const ADULT_STEMS = [
  'porn',
  'erotic',
  'erotiq',
  'erotik',
  'erotis',
  'genital',
  'masturb',
  'hentai',
  'порн',
  'эрот',
];

/** Phrases, mostly Commons category names, that name adult content without one word above. */
const ADULT_PHRASES = [
  'human breasts',
  'bare breasts',
  'fan service',
  'explicit medical',
  'sexually explicit',
];

/** Lowercase words with the accents removed: «Nudité» reads as «nudite». */
function plainWords(text: string): string[] {
  return words(text.normalize('NFD').replace(/\p{M}+/gu, ''));
}

function isAdultWord(word: string): boolean {
  return (
    ADULT_WORDS.has(word) || ADULT_STEMS.some(stem => word.startsWith(stem))
  );
}

/** True when the text names adult content: whole words, so «Sexton» and «Essex» stay. */
export function hasAdultWords(text: string): boolean {
  const found = plainWords(text);
  if (found.some(isAdultWord)) {
    return true;
  }
  const joined = ` ${found.join(' ')} `;
  return ADULT_PHRASES.some(phrase => joined.includes(` ${phrase} `));
}

/** A result to leave out: its title, or the categories its source sent with it, are adult. */
export function isAdult(
  result: Pick<SearchResult, 'title'>,
  categories = '',
): boolean {
  return hasAdultWords(result.title) || hasAdultWords(categories);
}

/** The results with every adult one left out, in their order. */
export function withoutAdult(results: readonly SearchResult[]): SearchResult[] {
  return results.filter(result => !isAdult(result));
}
