/**
 * The query languages the person chooses and orders (#68): the one table of languages the search
 * really handles, the product default and the pure steps of the Languages screen. The search core
 * only reads the list (`SourceContext.languages`); the app owns it.
 */

/**
 * The languages the pipeline handles: Wikipedia and Wikidata lookups, the owner's D4 A set. The
 * screen lists them in this order; their names are in `src/ui/copy.ts` as `language.<code>`.
 */
export const SUPPORTED_LANGUAGES = ['zh', 'es', 'en', 'pt'] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number];

/** Always in the default, and the default alone when the system language is unknown. */
export const FALLBACK_LANGUAGE: LanguageCode = 'en';

export function isSupportedLanguage(code: unknown): code is LanguageCode {
  return (
    typeof code === 'string' &&
    (SUPPORTED_LANGUAGES as readonly string[]).includes(code)
  );
}

/** `zh-CN`, `pt_BR` or `EN` to the code the table uses; null when it is not a language tag. */
export function languageCode(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const match = /^([a-z]{2,3})(?:[-_].*)?$/i.exec(raw.trim());
  return match ? match[1].toLowerCase() : null;
}

/** Each code once, in its first place. */
function unique(codes: readonly LanguageCode[]): LanguageCode[] {
  return codes.filter((code, index) => codes.indexOf(code) === index);
}

/**
 * The product default: the device's system language when the pipeline supports it, followed by
 * English; English alone when the system language is unknown or unsupported.
 */
export function defaultLanguages(system: string | null): LanguageCode[] {
  const code = languageCode(system);
  return isSupportedLanguage(code)
    ? unique([code, FALLBACK_LANGUAGE])
    : [FALLBACK_LANGUAGE];
}

export type LanguagesAction =
  | {type: 'add'; code: LanguageCode}
  | {type: 'remove'; code: LanguageCode}
  | {type: 'up'; code: LanguageCode}
  | {type: 'down'; code: LanguageCode}
  | {type: 'reset'; system: string | null};

/** Swaps the language with its neighbour `by` rows away; at an edge, nothing changes. */
function move(
  list: readonly LanguageCode[],
  code: LanguageCode,
  by: number,
): readonly LanguageCode[] {
  const from = list.indexOf(code);
  const to = from + by;
  if (from < 0 || to < 0 || to >= list.length) {
    return list;
  }
  const next = [...list];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/**
 * One tap on the Languages screen. The list is never empty: removing the last language changes
 * nothing. A step that changes nothing returns the same list, so the caller saves nothing.
 */
export function languagesStep(
  list: readonly LanguageCode[],
  action: LanguagesAction,
): readonly LanguageCode[] {
  switch (action.type) {
    case 'add':
      return list.includes(action.code) ? list : [...list, action.code];
    case 'remove':
      return list.length > 1 && list.includes(action.code)
        ? list.filter(code => code !== action.code)
        : list;
    case 'up':
      return move(list, action.code, -1);
    case 'down':
      return move(list, action.code, 1);
    case 'reset':
      return defaultLanguages(action.system);
  }
}

/** The supported languages not in use, in the table's order: the screen's ADD A LANGUAGE rows. */
export function addableLanguages(
  list: readonly LanguageCode[],
): LanguageCode[] {
  return SUPPORTED_LANGUAGES.filter(code => !list.includes(code));
}
