/** The library's data rules, independent of how files are written. */
import type {Library, LibraryItem} from './types';

export const LIBRARY_VERSION = 1;
export const RECENT_LIMIT = 8;

export type ParsedLibrary =
  | {ok: true; library: Library}
  | {ok: false; message: string};

export function emptyLibrary(): Library {
  return {items: [], recentSearches: []};
}

/** Newest first; adding an id again replaces its record and moves it to the front. */
export function addItem(library: Library, item: LibraryItem): Library {
  return {
    ...library,
    items: [item, ...library.items.filter(existing => existing.id !== item.id)],
  };
}

export function findItem(
  library: Library,
  id: string,
): LibraryItem | undefined {
  return library.items.find(item => item.id === id);
}

export function addRecentSearch(library: Library, query: string): Library {
  const trimmed = query.trim();
  if (!trimmed) {
    return library;
  }
  const others = library.recentSearches.filter(
    recent => recent.toLowerCase() !== trimmed.toLowerCase(),
  );
  return {
    ...library,
    recentSearches: [trimmed, ...others].slice(0, RECENT_LIMIT),
  };
}

export function serialize(library: Library): string {
  return JSON.stringify({version: LIBRARY_VERSION, ...library});
}

const STRING_FIELDS = [
  'id',
  'source',
  'sourceId',
  'sourceUrl',
  'query',
  'license',
  'attribution',
  'savedAt',
  'path',
] as const;
const NUMBER_FIELDS = ['width', 'height'] as const;

function isItem(value: unknown): value is LibraryItem {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    STRING_FIELDS.every(field => typeof record[field] === 'string') &&
    NUMBER_FIELDS.every(field => typeof record[field] === 'number')
  );
}

/** A stored library; anything unreadable is a failure, never an empty library. */
export function parseLibrary(text: string): ParsedLibrary {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return {ok: false, message: 'the library file is not JSON'};
  }
  const root = data as {
    version?: unknown;
    items?: unknown;
    recentSearches?: unknown;
  };
  if (root?.version !== LIBRARY_VERSION) {
    return {
      ok: false,
      message: `unknown library version ${String(root?.version)}`,
    };
  }
  if (!Array.isArray(root.items) || !root.items.every(isItem)) {
    return {ok: false, message: 'a library item is malformed'};
  }
  if (
    !Array.isArray(root.recentSearches) ||
    !root.recentSearches.every(q => typeof q === 'string')
  ) {
    return {ok: false, message: 'the recent searches are malformed'};
  }
  return {
    ok: true,
    library: {items: root.items, recentSearches: root.recentSearches},
  };
}
