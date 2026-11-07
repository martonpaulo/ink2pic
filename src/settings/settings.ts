/**
 * The person's settings, as `MyStyle/Ink2Pic/settings.json` keeps them (#68, #70): their shape,
 * their defaults, the one step of each Settings tap, and the reading of a file that may be
 * hand-edited. Pure; the device store is `src/storage/settings.ts`. A key or a value it does not
 * know is ignored with a problem line, and a missing or malformed file gives the defaults, never
 * an empty language list. Every default is today's behaviour, so nobody needs to open Settings.
 */
import {DEFAULT_ADAPTERS} from '../search-core';
import {
  defaultLanguages,
  isSupportedLanguage,
  LanguageCode,
  LanguagesAction,
  languagesStep,
} from './languages';

export const SETTINGS_VERSION = 1;

/** The options with one value out of a few, each list in screen order (#70). */
export const CHOICES = {
  /** The inserted picture's width; medium is today's, about one third of the page. */
  size: ['small', 'medium', 'large'],
  /** Below the word (today), in place of it (the handwriting is deleted), or beside it. */
  placement: ['below', 'replace', 'beside'],
  /** Drawings first (today), photos ranked as drawings, or every picture as a contour drawing. */
  style: ['drawings', 'photos', 'contour'],
} as const;

export type ChoiceKey = keyof typeof CHOICES;
export type Choice<K extends ChoiceKey> = (typeof CHOICES)[K][number];

export type Settings = {
  /** The query languages, tried in this order; never empty. */
  languages: readonly LanguageCode[];
  size: Choice<'size'>;
  placement: Choice<'placement'>;
  style: Choice<'style'>;
  /** The sources turned off, by adapter name; a source not listed is on, so a new one is on. */
  sourcesOff: readonly string[];
  /** Fewer results per search and smaller thumbnails. */
  dataSaver: boolean;
};

/** The inserted picture's width in page pixels for each size; medium is today's 640 (#70). */
export const SIZE_WIDTHS: Record<Choice<'size'>, number> = {
  small: 400,
  medium: 640,
  large: 960,
};

/** Every source the search has, by adapter name, in the order it searches them. */
export const SOURCE_NAMES: readonly string[] = DEFAULT_ADAPTERS.map(
  source => source.name,
);

/**
 * The reset group of every key (interface standard rule 12), as `docs/feature-defaults.md` names
 * it: the Languages screen's Reset restores «languages», the Settings screen's Reset all of them.
 */
export const RESET_GROUPS: Record<keyof Settings, string> = {
  languages: 'languages',
  size: 'insert',
  placement: 'insert',
  style: 'insert',
  sourcesOff: 'search',
  dataSaver: 'search',
};

export type ParsedSettings = {
  settings: Settings;
  /** One line per ignored part, for the log; empty when the file was read as it is. */
  problems: string[];
};

export function defaultSettings(system: string | null): Settings {
  return {
    languages: defaultLanguages(system),
    size: 'medium',
    placement: 'below',
    style: 'drawings',
    sourcesOff: [],
    dataSaver: false,
  };
}

export function serializeSettings(settings: Settings): string {
  return JSON.stringify({version: SETTINGS_VERSION, ...settings});
}

export type SettingsAction =
  | {type: 'languages'; action: LanguagesAction}
  | {type: 'choose'; key: ChoiceKey; value: string}
  | {type: 'source'; name: string; on: boolean}
  | {type: 'dataSaver'; on: boolean}
  | {type: 'reset'; system: string | null};

/** Whether a source is on. */
export function sourceOn(settings: Settings, name: string): boolean {
  return !settings.sourcesOff.includes(name);
}

/** One source is always on: the last one cannot be turned off, so a search always asks one. */
export function canTurnOff(settings: Settings, name: string): boolean {
  return (
    sourceOn(settings, name) &&
    SOURCE_NAMES.filter(other => sourceOn(settings, other)).length > 1
  );
}

function isChoice<K extends ChoiceKey>(
  key: K,
  value: unknown,
): value is Choice<K> {
  return (CHOICES[key] as readonly unknown[]).includes(value);
}

/**
 * One tap on the Settings or Languages screen. A step that changes nothing returns the same
 * object, so the caller saves nothing.
 */
export function settingsStep(
  settings: Settings,
  action: SettingsAction,
): Settings {
  switch (action.type) {
    case 'languages': {
      const languages = languagesStep(settings.languages, action.action);
      return languages === settings.languages
        ? settings
        : {...settings, languages};
    }
    case 'choose':
      return isChoice(action.key, action.value) &&
        settings[action.key] !== action.value
        ? {...settings, [action.key]: action.value}
        : settings;
    case 'source':
      if (action.on === sourceOn(settings, action.name)) {
        return settings;
      }
      if (action.on) {
        return {
          ...settings,
          sourcesOff: settings.sourcesOff.filter(name => name !== action.name),
        };
      }
      return canTurnOff(settings, action.name)
        ? {...settings, sourcesOff: [...settings.sourcesOff, action.name]}
        : settings;
    case 'dataSaver':
      return settings.dataSaver === action.on
        ? settings
        : {...settings, dataSaver: action.on};
    case 'reset':
      return defaultSettings(action.system);
  }
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

/** The known source names of a hand-edited list; never every source, so one stays on. */
function readSourcesOff(raw: unknown, problems: string[]): string[] | null {
  if (!Array.isArray(raw)) {
    problems.push('settings: sourcesOff is not a list; every source is on');
    return null;
  }
  const kept = raw.filter(
    (name, index): name is string =>
      SOURCE_NAMES.includes(name) && raw.indexOf(name) === index,
  );
  raw
    .filter(name => !kept.includes(name))
    .forEach(name =>
      problems.push(`settings: source ${JSON.stringify(name)} is ignored`),
    );
  if (kept.length >= SOURCE_NAMES.length) {
    problems.push('settings: every source is off; every source is on');
    return null;
  }
  return kept;
}

/** One field of the file, or the default with a problem line when it is not a known value. */
function readField<T>(
  fields: Record<string, unknown>,
  key: string,
  fallback: T,
  valid: (value: unknown) => value is T,
  problems: string[],
): T {
  if (!(key in fields)) {
    return fallback;
  }
  if (valid(fields[key])) {
    return fields[key] as T;
  }
  problems.push(
    `settings: ${key} ${JSON.stringify(
      fields[key],
    )} is ignored; the default is used`,
  );
  return fallback;
}

/** Every key of the file, so an unknown one is reported. */
const KEYS = new Set(['version', ...Object.keys(RESET_GROUPS)]);

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
  const choice = <K extends ChoiceKey>(key: K): Choice<K> =>
    readField(
      fields,
      key,
      defaults[key] as Choice<K>,
      (value): value is Choice<K> => isChoice(key, value),
      problems,
    );
  const languages =
    'languages' in fields ? readLanguages(fields.languages, problems) : null;
  const size = choice('size');
  const placement = choice('placement');
  const style = choice('style');
  const sourcesOff =
    'sourcesOff' in fields ? readSourcesOff(fields.sourcesOff, problems) : null;
  const dataSaver = readField(
    fields,
    'dataSaver',
    defaults.dataSaver,
    (value): value is boolean => typeof value === 'boolean',
    problems,
  );
  return {
    settings: {
      languages: languages ?? defaults.languages,
      size,
      placement,
      style,
      sourcesOff: sourcesOff ?? defaults.sourcesOff,
      dataSaver,
    },
    problems,
  };
}

/**
 * What changes a search's results, for the search cache: an answer found with other languages,
 * sources or style is another entry (#68, #70).
 */
export function searchVariant(settings: Settings): string {
  return [
    settings.languages.join(','),
    settings.sourcesOff.length ? `off:${settings.sourcesOff.join(',')}` : '',
    settings.style === 'photos' ? 'photos' : '',
    settings.dataSaver ? 'saver' : '',
  ]
    .filter(Boolean)
    .join('|');
}
