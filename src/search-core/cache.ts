/**
 * Search outcomes cached in one JSON file, so a repeated search opens at once and works
 * offline (brief section 8.5). The cache is reconstructible, never a source of truth: an
 * unreadable file is reported to the caller and rebuilt, never read as an empty result.
 * The file is read once per runtime and kept parsed in memory; a write runs after the results
 * are shown, never before (#46).
 */
import {Clock, systemClock} from './clock';
import {isSourceName, storedOriginal} from './registry';
import type {SearchOutcome, SourceStatus} from './search';
import type {SearchResult} from './types';

/** Text files where the cache lives; `readText` gives null when the file does not exist. */
export type TextStore = {
  readText: (path: string) => Promise<string | null>;
  writeText: (path: string, text: string) => Promise<void>;
};

export type CacheOptions = {
  storage: TextStore;
  /** The cache file in `storage`. */
  path: string;
  clock?: Clock;
};

/**
 * Raised when cached results would show in an order the current ranking no longer gives: 2 since
 * the drawing-first ranking of #43, so a search from build 0.1.0 (12) is not reused (#59); 3 since
 * the adult filter, so no cached search shows a picture it now leaves out (#69).
 */
export const CACHE_VERSION = 3;
/** Newest entries kept; the oldest is evicted first. DEFAULT, no device measurement yet. */
export const CACHE_LIMIT = 24;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Older entries are searched again. DEFAULT: a week keeps offline repeats useful. */
export const CACHE_MAX_AGE_MS = 7 * DAY_MS;

/**
 * A SearchResult as the file keeps it. A Commons `original` is kept only when an insert takes it
 * as it is (#55), with the insert width as its width, an upper bound. An entry without `original`
 * stays valid and rebuilds the thumbnail, so the cache version does not change.
 */
export type StoredResult = Omit<
  SearchResult,
  'canonical' | 'localPath' | 'localSize'
>;
type StoredOutcome = Omit<SearchOutcome, 'results'> & {results: StoredResult[]};
type Entry = {query: string; savedAt: number; outcome: StoredOutcome};

export type CachedSearch = {
  outcome: SearchOutcome;
  /** Fresh: a cached answer in its week; live: the sources' answer; stale: see `stale`. */
  freshness: 'fresh' | 'live' | 'stale';
  /** Why the cache file could not be read; the caller logs it. */
  problem?: string;
  /**
   * The cache write, started and not awaited: it resolves why the file could not be written,
   * or null; the caller logs a failure. Absent when nothing is written.
   */
  saved?: Promise<string | null>;
};

/** Parsed entries per storage and path, newest first, kept for the runtime. */
const memory = new WeakMap<TextStore, Map<string, Entry[]>>();

function remembered(storage: TextStore): Map<string, Entry[]> {
  let byPath = memory.get(storage);
  if (!byPath) {
    byPath = new Map();
    memory.set(storage, byPath);
  }
  return byPath;
}

export function cacheKey(query: string): string {
  return query.trim().toLowerCase();
}

function store(result: SearchResult): StoredResult {
  const {id, source, title, thumbUrl, license, attribution, mime} = result;
  const original = storedOriginal(result);
  return {
    id,
    source,
    title,
    thumbUrl,
    license,
    attribution,
    mime,
    ...(original && {original}),
  };
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

function isOriginal(value: unknown): boolean {
  return (
    value === undefined ||
    (isObject(value) &&
      typeof value.url === 'string' &&
      typeof value.width === 'number')
  );
}

function isStoredResult(value: unknown): value is StoredResult {
  return (
    isObject(value) &&
    isSourceName(value.source) &&
    STRING_FIELDS.every(field => typeof value[field] === 'string') &&
    (value.mime === undefined || typeof value.mime === 'string') &&
    isOriginal(value.original)
  );
}

function isStatus(value: unknown): value is SourceStatus {
  return isObject(value) && typeof value.state === 'string';
}

function isEntry(value: unknown): value is Entry {
  if (!isObject(value) || !isObject(value.outcome)) {
    return false;
  }
  const {results, statuses, sourceDown, allFailed, correctedQuery} =
    value.outcome;
  return (
    typeof value.query === 'string' &&
    typeof value.savedAt === 'number' &&
    Array.isArray(results) &&
    results.every(isStoredResult) &&
    isObject(statuses) &&
    Object.values(statuses).every(isStatus) &&
    typeof sourceDown === 'boolean' &&
    typeof allFailed === 'boolean' &&
    (correctedQuery === undefined || typeof correctedQuery === 'string') &&
    value.outcome.stale === undefined
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
  storage: TextStore,
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
 * stored when worth keeping.
 */
export async function cachedSearch(
  query: string,
  run: (query: string) => Promise<SearchOutcome>,
  {storage, path, clock = systemClock}: CacheOptions,
): Promise<CachedSearch> {
  const now = clock.now();
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
      // A new outcome per hit, as a fresh search gives one.
      outcome: {...hit.outcome, results: [...hit.outcome.results]},
      freshness: 'fresh',
    };
  }
  const outcome = await run(query);
  if (hit && outcome.allFailed) {
    // Every source failed: an expired answer is better than none, and says it is old.
    return {
      outcome: {...hit.outcome, results: [...hit.outcome.results], stale: true},
      freshness: 'stale',
      problem,
    };
  }
  if (!worthKeeping(outcome)) {
    return {outcome, freshness: 'live', problem};
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
  return {outcome, freshness: 'live', problem, saved};
}
