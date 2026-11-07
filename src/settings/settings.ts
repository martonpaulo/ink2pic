/**
 * The person's settings, as `MyStyle/Ink2Pic/settings.json` keeps them (#68): their shape, their
 * defaults and the reading of a file that may be hand-edited. Pure; the device store is
 * `src/storage/settings.ts`. A key or a value it does not know is ignored with a problem line, and
 * a missing or malformed file gives the defaults, never an empty language list.
 */
import {defaultLanguages, isSupportedLanguage, LanguageCode} from './languages';

export const SETTINGS_VERSION = 1;

export type Settings = {
  /** The query languages, tried in this order; never empty. */
  languages: readonly LanguageCode[];
};

/**
 * The reset group of every key (interface standard rule 12): the Reset that restores it, as
 * `docs/feature-defaults.md` names it.
 */
export const RESET_GROUPS: Record<keyof Settings, string> = {
  languages: 'languages',
};

/** Every key of the file, so an unknown one is reported. */
const KEYS = new Set(['version', 'languages']);

export type ParsedSettings = {
  settings: Settings;
  /** One line per ignored part, for the log; empty when the file was read as it is. */
  problems: string[];
};

export function defaultSettings(system: string | null): Settings {
  return {languages: defaultLanguages(system)};
}

export function serializeSettings(settings: Settings): string {
  return JSON.stringify({version: SETTINGS_VERSION, ...settings});
}

/** The supported codes of a hand-edited list, each once; every other entry is a problem line. */
function readLanguages(
  raw: unknown,
  problems: string[],
): LanguageCode[] | null {
  if (!Array.isArray(raw)) {
    problems.push('settings: languages is not a list; the default is used');
    return null;
  }
  const kept: LanguageCode[] = [];
  for (const code of raw) {
    if (!isSupportedLanguage(code)) {
      problems.push(`settings: language ${JSON.stringify(code)} is ignored`);
    } else if (kept.includes(code)) {
      problems.push(`settings: language ${code} is listed twice`);
    } else {
      kept.push(code);
    }
  }
  if (kept.length === 0) {
    problems.push('settings: no supported language; the default is used');
    return null;
  }
  return kept;
}

/** The settings a file holds; `null` text is a missing file, which uses the defaults silently. */
export function parseSettings(
  text: string | null,
  system: string | null,
): ParsedSettings {
  const defaults = defaultSettings(system);
  if (text === null) {
    return {settings: defaults, problems: []};
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return {
      settings: defaults,
      problems: [`settings: the file is not JSON (${String(error)})`],
    };
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      settings: defaults,
      problems: ['settings: the file is not an object'],
    };
  }
  const fields = raw as Record<string, unknown>;
  const problems = Object.keys(fields)
    .filter(key => !KEYS.has(key))
    .map(key => `settings: unknown key ${key} is ignored`);
  const languages =
    'languages' in fields ? readLanguages(fields.languages, problems) : null;
  return {
    settings: {languages: languages ?? defaults.languages},
    problems,
  };
}
