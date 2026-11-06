/**
 * Search outcomes cached in one JSON file, so a repeated search opens at once and works
 * offline (brief section 8.5). The cache is reconstructible, never a source of truth: an
 * unreadable file is reported to the caller and rebuilt, never read as an empty result.
 * The file is read once per runtime and kept parsed in memory; a write runs after the results
 * are shown, never before (#46).
 */
import {resizeThumb} from '../sources/commons';
import {imageUrl} from '../sources/openclipart';
import type {SearchResult, SourceName} from '../sources/types';
import type {TextStorage} from '../library/types';
import type {SearchOutcome, SourceStatus} from './search';

export const CACHE_VERSION = 1;
/** Newest entries kept; the oldest is evicted first. DEFAULT, no device measurement yet. */
export const CACHE_LIMIT = 24;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Older entries are searched again. DEFAULT: a week keeps offline repeats useful. */
export const CACHE_MAX_AGE_MS = 7 * DAY_MS;

/** A SearchResult without its fullUrl function, which JSON cannot hold. */
export type StoredResult = Omit<SearchResult, 'fullUrl'>;
type StoredOutcome = Omit<SearchOutcome, 'results'> & {results: StoredResult[]};
type Entry = {query: string; savedAt: number; outcome: StoredOutcome};

export type CachedSearch = {
  outcome: SearchOutcome;
  fromCache: boolean;
  /** Why the cache file could not be read; the caller logs it. */
  problem?: string;
  /**
   * The cache write, started and not awaited: it resolves why the file could not be written,
   * or null; the caller logs a failure. Absent when nothing is written.
   */
  saved?: Promise<string | null>;
};

/** Parsed entries per storage and path, newest first, kept for the runtime. */
const memory = new WeakMap<TextStorage, Map<string, Entry[]>>();

function remembered(storage: TextStorage): Map<string, Entry[]> {
  let byPath = memory.get(storage);
  if (!byPath) {
    byPath = new Map();
    memory.set(storage, byPath);
  }
  return byPath;
}

/** fullUrl rebuilt per source with the same rule the source module uses. */
const FULL_URL: Record<
  SourceName,
  (result: StoredResult) => (width: number) => string
> = {
  openclipart: result => {
    const sourceId = result.id.slice(result.id.indexOf(':') + 1);
    return width => imageUrl(sourceId, width);
  },
  commons: result => width => resizeThumb(result.thumbUrl, width),
};

export function cacheKey(query: string): string {
  return query.trim().toLowerCase();
}

function store(result: SearchResult): StoredResult {
  const {id, source, title, thumbUrl, license, attribution, mime} = result;
  return {id, source, title, thumbUrl, license, attribution, mime};
}

function restore(result: StoredResult): SearchResult {
  return {...result, fullUrl: FULL_URL[result.source](result)};
}

const STRING_FIELDS = [
  'id',
  'title',
  'thumbUrl',
  'license',
  'attribution',
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isStoredResult(value: unknown): value is StoredResult {
  return (
    isObject(value) &&
    typeof value.source === 'string' &&
    Object.keys(FULL_URL).includes(value.source) &&
    STRING_FIELDS.every(field => typeof value[field] === 'string') &&
    (value.mime === undefined || typeof value.mime === 'string')
  );
}

function isStatus(value: unknown): value is SourceStatus {
  return isObject(value) && typeof value.state === 'string';
}

function isEntry(value: unknown): value is Entry {
  if (!isObject(value) || !isObject(value.outcome)) {
    return false;
  }
  const {results, statuses, sourceDown, allFailed} = value.outcome;
  return (
    typeof value.query === 'string' &&
    typeof value.savedAt === 'number' &&
    Array.isArray(results) &&
    results.every(isStoredResult) &&
    isObject(statuses) &&
    Object.values(statuses).every(isStatus) &&
    typeof sourceDown === 'boolean' &&
    typeof allFailed === 'boolean'
  );
}

type ParsedCache = {ok: true; entries: Entry[]} | {ok: false; message: string};

/** Entries newest first; anything unreadable is a failure, never an empty cache. */
export function parseCache(text: string): ParsedCache {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return {ok: false, message: 'the search cache file is not JSON'};
  }
  const root = data as {version?: unknown; entries?: unknown} | null;
  if (root?.version !== CACHE_VERSION) {
    return {
      ok: false,
      message: `unknown search cache version ${String(root?.version)}`,
    };
  }
  if (!Array.isArray(root.entries) || !root.entries.every(isEntry)) {
    return {ok: false, message: 'a search cache entry is malformed'};
  }
  return {ok: true, entries: root.entries};
}

function serialize(entries: Entry[]): string {
  return JSON.stringify({version: CACHE_VERSION, entries});
}

function isFresh(entry: Entry, now: number): boolean {
  const age = now - entry.savedAt;
  return age >= 0 && age < CACHE_MAX_AGE_MS;
}

/** Only a complete answer with pictures is kept: a failure or a partial answer is retried. */
function worthKeeping(outcome: SearchOutcome): boolean {
  return (
    outcome.results.length > 0 && !outcome.sourceDown && !outcome.allFailed
  );
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readEntries(
  storage: TextStorage,
  path: string,
): Promise<ParsedCache> {
  try {
    const text = await storage.readText(path);
    return text === null ? {ok: true, entries: []} : parseCache(text);
  } catch (error) {
    return {
      ok: false,
      message: `cannot read the search cache: ${message(error)}`,
    };
  }
}

/**
 * A fresh cached outcome for the query without calling `run`; otherwise `run`'s outcome,
 * stored when worth keeping. `now` is milliseconds since the epoch.
 */
export async function cachedSearch(
  query: string,
  run: (query: string) => Promise<SearchOutcome>,
  storage: TextStorage,
  path: string,
  now: number,
): Promise<CachedSearch> {
  const key = cacheKey(query);
  const byPath = remembered(storage);
  const inMemory = byPath.get(path);
  const read: ParsedCache = inMemory
    ? {ok: true, entries: inMemory}
    : await readEntries(storage, path);
  const entries = read.ok ? read.entries : [];
  const problem = read.ok ? undefined : read.message;
  if (read.ok) {
    byPath.set(path, entries);
  }
  const hit = entries.find(entry => entry.query === key);
  if (hit && isFresh(hit, now)) {
    return {
      outcome: {...hit.outcome, results: hit.outcome.results.map(restore)},
      fromCache: true,
    };
  }
  const outcome = await run(query);
  if (!worthKeeping(outcome)) {
    return {outcome, fromCache: false, problem};
  }
  const entry: Entry = {
    query: key,
    savedAt: now,
    outcome: {...outcome, results: outcome.results.map(store)},
  };
  const kept = [entry, ...entries.filter(e => e.query !== key)].slice(
    0,
    CACHE_LIMIT,
  );
  // The memory holds what the file will hold: the next search reads it without the file.
  byPath.set(path, kept);
  const saved = Promise.resolve()
    .then(() => storage.writeText(path, serialize(kept)))
    .then(
      () => null,
      error => `cannot write the search cache: ${message(error)}`,
    );
  return {outcome, fromCache: false, problem, saved};
}
