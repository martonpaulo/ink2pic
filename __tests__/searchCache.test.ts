import {
  CACHE_LIMIT,
  CACHE_MAX_AGE_MS,
  CACHE_VERSION,
  cachedSearch,
  cacheKey,
} from '../src/search/cache';
import type {SearchOutcome} from '../src/search/search';
import type {SearchResult} from '../src/sources/types';
import type {TextStorage} from '../src/library/types';

const PATH = '/plugin/search-cache.json';
const NOW = Date.UTC(2026, 10, 6, 12);
const THUMB =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Soup.png/330px-Soup.png';

const openclipart: SearchResult = {
  id: 'openclipart:42',
  source: 'openclipart',
  title: 'soup bowl',
  thumbUrl: 'https://openclipart.org/image/400px/42',
  fullUrl: width => `https://openclipart.org/image/${width}px/42`,
  license: 'CC0 1.0',
  attribution: 'Openclipart',
  mime: 'image/png',
};
const commons: SearchResult = {
  id: 'commons:7',
  source: 'commons',
  title: 'Soup',
  thumbUrl: THUMB,
  fullUrl: () => 'unused',
  license: 'CC BY-SA 4.0',
  attribution: 'Example Artist',
};

function outcome(
  results: SearchResult[] = [openclipart, commons],
  failed = 0,
): SearchOutcome {
  return {
    results,
    statuses: {openclipart: {state: 'ok', count: results.length}},
    sourceDown: failed === 1,
    allFailed: failed === 2,
  };
}

function memoryStorage(files: Record<string, string> = {}) {
  const storage: TextStorage = {
    readText: async path => files[path] ?? null,
    writeText: async (path, text) => {
      files[path] = text;
    },
  };
  return {storage, files};
}

function runner(result: SearchOutcome = outcome()) {
  return jest.fn(async (_query: string) => result);
}

describe('cachedSearch', () => {
  it('runs on a miss and serves a repeat from the cache', async () => {
    const {storage} = memoryStorage();
    const run = runner();
    const first = await cachedSearch(' Soup ', run, storage, PATH, NOW);
    expect(first.fromCache).toBe(false);
    const again = await cachedSearch('soup', run, storage, PATH, NOW + 1);
    expect(again.fromCache).toBe(true);
    expect(again.problem).toBeUndefined();
    expect(run).toHaveBeenCalledTimes(1);
    expect(again.outcome.results.map(r => r.id)).toEqual([
      'openclipart:42',
      'commons:7',
    ]);
  });

  it('rebuilds fullUrl per source', async () => {
    const {storage} = memoryStorage();
    await cachedSearch('soup', runner(), storage, PATH, NOW);
    const {outcome: cached} = await cachedSearch(
      'soup',
      runner(),
      storage,
      PATH,
      NOW,
    );
    const [clip, photo] = cached.results;
    expect(clip.fullUrl(1000)).toBe('https://openclipart.org/image/1000px/42');
    expect(photo.fullUrl(1000)).toBe(THUMB.replace('/330px-', '/1280px-'));
  });

  it('searches again once an entry expires', async () => {
    const {storage} = memoryStorage();
    const run = runner();
    await cachedSearch('soup', run, storage, PATH, NOW);
    const late = await cachedSearch(
      'soup',
      run,
      storage,
      PATH,
      NOW + CACHE_MAX_AGE_MS,
    );
    expect(late.fromCache).toBe(false);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('evicts the oldest entry past the cap', async () => {
    const {storage, files} = memoryStorage();
    for (let i = 0; i <= CACHE_LIMIT; i++) {
      await cachedSearch(`q${i}`, runner(), storage, PATH, NOW + i);
    }
    const entries = JSON.parse(files[PATH]).entries as {query: string}[];
    expect(entries).toHaveLength(CACHE_LIMIT);
    expect(entries[0].query).toBe(`q${CACHE_LIMIT}`);
    expect(entries.map(e => e.query)).not.toContain('q0');
  });

  it.each([
    ['not JSON', '{oops', 'not JSON'],
    ['an unknown version', JSON.stringify({version: 99, entries: []}), '99'],
    [
      'a malformed entry',
      JSON.stringify({version: CACHE_VERSION, entries: [{query: 'soup'}]}),
      'malformed',
    ],
  ])('reports a file with %s, then rebuilds it', async (_name, text, why) => {
    const {storage, files} = memoryStorage({[PATH]: text});
    const run = runner();
    const result = await cachedSearch('soup', run, storage, PATH, NOW);
    expect(run).toHaveBeenCalledTimes(1);
    expect(result.fromCache).toBe(false);
    expect(result.outcome.results).toHaveLength(2);
    expect(result.problem).toContain(why);
    expect(JSON.parse(files[PATH]).version).toBe(CACHE_VERSION);
  });

  it.each([
    ['every source failed', outcome([], 2)],
    ['a source is down', outcome([openclipart], 1)],
    ['nothing was found', outcome([])],
  ])('does not keep an outcome where %s', async (_name, answer) => {
    const {storage, files} = memoryStorage();
    const run = runner(answer);
    await cachedSearch('soup', run, storage, PATH, NOW);
    const again = await cachedSearch('soup', run, storage, PATH, NOW);
    expect(again.fromCache).toBe(false);
    expect(run).toHaveBeenCalledTimes(2);
    expect(files[PATH]).toBeUndefined();
  });

  it('still returns the outcome when the cache cannot be written', async () => {
    const storage: TextStorage = {
      readText: async () => null,
      writeText: async () => {
        throw new Error('disk full');
      },
    };
    const result = await cachedSearch('soup', runner(), storage, PATH, NOW);
    expect(result.outcome.results).toHaveLength(2);
    expect(result.problem).toContain('disk full');
  });

  it('normalizes the key', () => {
    expect(cacheKey('  Soup Bowl ')).toBe('soup bowl');
  });
});
