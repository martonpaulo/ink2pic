import {
  CACHE_LIMIT,
  CACHE_MAX_AGE_MS,
  CACHE_VERSION,
  cachedSearch,
  cacheKey,
} from '../src/search-core/cache';
import type {SearchOutcome} from '../src/search-core/search';
import type {SearchResult} from '../src/search-core/types';
import {systemClock} from '../src/search-core/clock';
import {fullUrl} from '../src/search-core/registry';
import {searchState} from '../src/search-core/state';
import type {TextStorage} from '../src/storage/text';

const PATH = '/plugin/search-cache.json';
const NOW = Date.UTC(2026, 10, 6, 12);
/** A clock stopped at `now`. */
const at = (now: number) => ({...systemClock, now: () => now});
const THUMB =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Soup.png/330px-Soup.png';

const openclipart: SearchResult = {
  id: 'openclipart:42',
  source: 'openclipart',
  title: 'soup bowl',
  thumbUrl: 'https://openclipart.org/image/400px/42',
  license: 'CC0 1.0',
  attribution: 'Openclipart',
  mime: 'image/png',
};
const commons: SearchResult = {
  id: 'commons:7',
  source: 'commons',
  title: 'Soup',
  thumbUrl: THUMB,
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
    const first = await cachedSearch(' Soup ', run, {
      storage,
      path: PATH,
      clock: at(NOW),
    });
    expect(first.freshness).toBe('live');
    const again = await cachedSearch('soup', run, {
      storage,
      path: PATH,
      clock: at(NOW + 1),
    });
    expect(again.freshness).toBe('fresh');
    expect(again.problem).toBeUndefined();
    expect(run).toHaveBeenCalledTimes(1);
    expect(again.outcome.results.map(r => r.id)).toEqual([
      'openclipart:42',
      'commons:7',
    ]);
  });

  it('gives a cached result the URL of each source', async () => {
    const {storage} = memoryStorage();
    await cachedSearch('soup', runner(), {storage, path: PATH, clock: at(NOW)});
    const {outcome: cached} = await cachedSearch('soup', runner(), {
      storage,
      path: PATH,
      clock: at(NOW),
    });
    const [clip, photo] = cached.results;
    expect(fullUrl(clip, 1000)).toBe('https://openclipart.org/image/1000px/42');
    expect(fullUrl(photo, 1000)).toBe(THUMB.replace('/330px-', '/1280px-'));
  });

  it('keeps a symbol that leads, so the measures keep it first (#67)', async () => {
    const symbol: SearchResult = {
      id: 'openmoji:2744',
      source: 'openmoji',
      title: 'snowflake',
      thumbUrl:
        'https://raw.githubusercontent.com/hfg-gmuend/openmoji/master/black/618x618/2744.png',
      license: 'CC BY-SA 4.0',
      attribution: 'OpenMoji',
      mime: 'image/png',
      leads: true,
    };
    const {storage} = memoryStorage();
    const run = runner(outcome([symbol, openclipart]));
    await cachedSearch('cold', run, {storage, path: PATH, clock: at(NOW)});
    const {outcome: cached, freshness} = await cachedSearch('cold', run, {
      storage,
      path: PATH,
      clock: at(NOW),
    });
    expect(freshness).toBe('fresh');
    expect(cached.results[0]).toEqual(symbol);
    expect(cached.results[1].leads).toBeUndefined();
  });

  it('keeps a canonical picture canonical across a write and a new read (#99)', async () => {
    const logo: SearchResult = {
      id: 'commons:Google_logo.svg',
      source: 'commons',
      title: 'Google logo',
      thumbUrl: THUMB,
      license: 'Public domain',
      attribution: 'Wikidata',
      canonical: true,
      leads: true,
    };
    const {storage, files} = memoryStorage();
    const run = runner(outcome([logo, openclipart]));
    await (
      await cachedSearch('google', run, {storage, path: PATH, clock: at(NOW)})
    ).saved;
    const {storage: reread} = memoryStorage(files);
    const {outcome: cached, freshness} = await cachedSearch('google', run, {
      storage: reread,
      path: PATH,
      clock: at(NOW),
    });
    expect(freshness).toBe('fresh');
    expect(cached.results).toEqual([logo, openclipart]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('rebuilds a cache of version 3, whose entries lost canonical (#99)', async () => {
    const {storage, files} = memoryStorage({
      [PATH]: JSON.stringify({version: 3, entries: []}),
    });
    const result = await cachedSearch('soup', runner(), {
      storage,
      path: PATH,
      clock: at(NOW),
    });
    expect(result.problem).toBe('unknown search cache version 3');
    await result.saved;
    expect(JSON.parse(files[PATH]).version).toBe(4);
  });

  it('keeps a narrow Commons original, so a cached result is never upscaled (#55)', async () => {
    const original = {
      url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Soup.png',
      width: 576,
    };
    const narrow: SearchResult = {...commons, mime: 'image/png', original};
    const {storage, files} = memoryStorage();
    const fresh = await cachedSearch('soup', runner(outcome([narrow])), {
      storage,
      path: PATH,
      clock: at(NOW),
    });
    await fresh.saved;
    // A new storage over the same files: the entry is read back from the file.
    const {outcome: cached, freshness} = await cachedSearch('soup', runner(), {
      storage: memoryStorage(files).storage,
      path: PATH,
      clock: at(NOW),
    });
    expect(freshness).toBe('fresh');
    expect(fullUrl(cached.results[0], 960)).toBe(original.url);
    expect(fullUrl(cached.results[0], 960)).toBe(fullUrl(narrow, 960));
  });

  it('searches again once an entry expires', async () => {
    const {storage} = memoryStorage();
    const run = runner();
    await cachedSearch('soup', run, {storage, path: PATH, clock: at(NOW)});
    const late = await cachedSearch('soup', run, {
      storage,
      path: PATH,
      clock: at(NOW + CACHE_MAX_AGE_MS),
    });
    expect(late.freshness).toBe('live');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('evicts the oldest entry past the cap', async () => {
    const {storage, files} = memoryStorage();
    for (let i = 0; i <= CACHE_LIMIT; i++) {
      await cachedSearch(`q${i}`, runner(), {
        storage,
        path: PATH,
        clock: at(NOW + i),
      });
    }
    const entries = JSON.parse(files[PATH]).entries as {query: string}[];
    expect(entries).toHaveLength(CACHE_LIMIT);
    expect(entries[0].query).toBe(`q${CACHE_LIMIT}`);
    expect(entries.map(e => e.query)).not.toContain('q0');
  });

  it.each([
    ['not JSON', '{oops', 'not JSON'],
    ['an unknown version', JSON.stringify({version: 99, entries: []}), '99'],
    // Version 1 holds results in the order before the drawing ranking (#43, #59).
    [
      'the version before the drawing ranking',
      JSON.stringify({version: 1, entries: []}),
      'version 1',
    ],
    [
      'a malformed entry',
      JSON.stringify({version: CACHE_VERSION, entries: [{query: 'soup'}]}),
      'malformed',
    ],
  ])('reports a file with %s, then rebuilds it', async (_name, text, why) => {
    const {storage, files} = memoryStorage({[PATH]: text});
    const run = runner();
    const result = await cachedSearch('soup', run, {
      storage,
      path: PATH,
      clock: at(NOW),
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(result.freshness).toBe('live');
    expect(result.outcome.results).toHaveLength(2);
    expect(result.problem).toContain(why);
    expect(await result.saved).toBeNull();
    expect(JSON.parse(files[PATH]).version).toBe(CACHE_VERSION);
  });

  it.each([
    ['every source failed', outcome([], 2)],
    ['a source is down', outcome([openclipart], 1)],
    ['nothing was found', outcome([])],
  ])('does not keep an outcome where %s', async (_name, answer) => {
    const {storage, files} = memoryStorage();
    const run = runner(answer);
    await cachedSearch('soup', run, {storage, path: PATH, clock: at(NOW)});
    const again = await cachedSearch('soup', run, {
      storage,
      path: PATH,
      clock: at(NOW),
    });
    expect(again.freshness).toBe('live');
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
    const result = await cachedSearch('soup', runner(), {
      storage,
      path: PATH,
      clock: at(NOW),
    });
    expect(result.outcome.results).toHaveLength(2);
    expect(result.problem).toBeUndefined();
    expect(await result.saved).toContain('disk full');
  });

  it('reads the file once per runtime and keeps the parsed entries (#46)', async () => {
    const {storage} = memoryStorage();
    const readText = jest.spyOn(storage, 'readText');
    const run = runner();
    await cachedSearch('soup', run, {storage, path: PATH, clock: at(NOW)});
    await cachedSearch('bread', run, {storage, path: PATH, clock: at(NOW)});
    const again = await cachedSearch('soup', run, {
      storage,
      path: PATH,
      clock: at(NOW),
    });
    expect(readText).toHaveBeenCalledTimes(1);
    expect(again.freshness).toBe('fresh');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('returns the outcome before the cache write ends (#46)', async () => {
    let finish!: () => void;
    const storage: TextStorage = {
      readText: async () => null,
      writeText: () => new Promise<void>(resolve => (finish = resolve)),
    };
    const result = await cachedSearch('soup', runner(), {
      storage,
      path: PATH,
      clock: at(NOW),
    });
    expect(result.outcome.results).toHaveLength(2);
    let saved: string | null | undefined;
    result.saved?.then(problem => (saved = problem));
    await Promise.resolve();
    expect(saved).toBeUndefined();
    finish();
    expect(await result.saved).toBeNull();
  });

  it('normalizes the key', () => {
    expect(cacheKey('  Soup Bowl ')).toBe('soup bowl');
  });
});

describe('an expired answer when every source fails (#65)', () => {
  const allDown: SearchOutcome = {
    results: [],
    statuses: {
      openclipart: {state: 'failed', kind: 'network', message: 'offline'},
    },
    sourceDown: false,
    allFailed: true,
  };

  it('shows the expired entry, marked stale, instead of nothing', async () => {
    const {storage} = memoryStorage();
    const first = await cachedSearch('soup', runner(), {
      storage,
      path: PATH,
      clock: at(NOW),
    });
    await first.saved;
    const late = await cachedSearch('soup', runner(allDown), {
      storage,
      path: PATH,
      clock: at(NOW + CACHE_MAX_AGE_MS),
    });
    expect(late.freshness).toBe('stale');
    expect(late.outcome.stale).toBe(true);
    expect(late.outcome.results.map(x => x.id)).toEqual([
      openclipart.id,
      commons.id,
    ]);
    expect(searchState(late.outcome)).toEqual({
      kind: 'stale',
      results: late.outcome.results,
    });
  });

  it('prefers a live empty answer, and has nothing stale without an entry', async () => {
    const {storage} = memoryStorage();
    await cachedSearch('soup', runner(), {storage, path: PATH, clock: at(NOW)});
    const empty = outcome([]);
    const live = await cachedSearch('soup', runner(empty), {
      storage,
      path: PATH,
      clock: at(NOW + CACHE_MAX_AGE_MS),
    });
    expect(live.freshness).toBe('live');
    expect(live.outcome).toBe(empty);
    const none = await cachedSearch('bread', runner(allDown), {
      storage,
      path: PATH,
      clock: at(NOW + CACHE_MAX_AGE_MS),
    });
    expect(none.freshness).toBe('live');
    expect(none.outcome).toBe(allDown);
  });
});
