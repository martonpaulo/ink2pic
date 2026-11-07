import {readFileSync} from 'fs';
import {join} from 'path';
import {BREAKER_OPEN_MS, createBreaker} from '../src/search-core/breaker';
import {cachedSearch} from '../src/search-core/cache';
import {systemClock} from '../src/search-core/clock';
import type {SourceAdapter} from '../src/search-core/adapter';
import {PAGE_SIZE, isThin} from '../src/search-core/pages';
import {searchAll} from '../src/search-core/search';
import {searchState} from '../src/search-core/state';
import {createContext, FetchLike} from '../src/search-core/fetcher';
import {DEFAULT_ADAPTERS} from '../src/search-core/registry';
import type {SearchResult, SourceOutcome} from '../src/search-core/types';

const result = (id: string): SearchResult => ({
  id,
  source: 'openclipart',
  title: id,
  thumbUrl: 'https://example.test/t',
  license: 'CC0 1.0',
  attribution: 'x',
});
const answering = (name: string, outcome: SourceOutcome): SourceAdapter => ({
  name,
  search: () => Promise.resolve(outcome),
});
const never = (name: string): SourceAdapter => ({
  name,
  search: () => new Promise(() => {}),
});

/** One full page 1 of results, `prefix`1 to `prefix`6. */
const page = (prefix: string): SearchResult[] =>
  Array.from({length: PAGE_SIZE}, (_, i) => result(`${prefix}${i + 1}`));

afterEach(() => jest.useRealTimers());

describe('searchAll', () => {
  it('merges both sources', async () => {
    const outcome = await searchAll('soup', [
      answering('a', {ok: true, results: [result('a1')]}),
      answering('b', {ok: true, results: [result('b1')]}),
    ]);
    expect(outcome.results.map(x => x.id)).toEqual(['a1', 'b1']);
    expect(outcome.statuses).toEqual({
      a: {state: 'ok', count: 1},
      b: {state: 'ok', count: 1},
    });
    expect(outcome.sourceDown).toBe(false);
  });

  it('returns the other source when one is slow', async () => {
    jest.useFakeTimers();
    const pending = searchAll(
      'soup',
      [answering('a', {ok: true, results: [result('a1')]}), never('b')],
      {timeoutMs: 5000},
    );
    await jest.advanceTimersByTimeAsync(5000);
    const outcome = await pending;
    expect(outcome.results.map(x => x.id)).toEqual(['a1']);
    expect(outcome.statuses.b).toEqual({
      state: 'failed',
      kind: 'timeout',
      message: 'no answer in 5000 ms',
    });
    expect(outcome.sourceDown).toBe(true);
  });

  it('keeps a throttled source and a thrown error as failures', async () => {
    const outcome = await searchAll('soup', [
      answering('a', {ok: false, kind: 'throttled', message: 'HTTP 429'}),
      {name: 'b', search: () => Promise.reject(new Error('boom'))},
    ]);
    expect(outcome.results).toEqual([]);
    expect(outcome.allFailed).toBe(true);
    expect(outcome.sourceDown).toBe(false);
    expect(outcome.statuses.b).toEqual({
      state: 'failed',
      kind: 'fault',
      message: 'boom',
    });
  });

  it('a thrown adapter error is a logged fault, never offline (#104)', async () => {
    const log = jest.fn();
    const fault: SourceAdapter = {
      name: 'commons',
      search: () => Promise.reject(new TypeError('x is undefined')),
    };
    const outcome = await searchAll('soup', [fault, fault], {
      ctx: {...createContext({fetch: jest.fn(), userAgent: '', languages: []}), log},
      correct: false,
    });
    expect(outcome.statuses.commons).toMatchObject({kind: 'fault'});
    expect(searchState(outcome).kind).toBe('failed');
    expect(log).toHaveBeenCalledWith('search: commons threw: x is undefined');
  });

  it('tells an empty answer from a failure', async () => {
    const outcome = await searchAll('qzx', [
      answering('a', {ok: true, results: []}),
    ]);
    expect(outcome.statuses.a).toEqual({state: 'empty'});
    expect(outcome.allFailed).toBe(false);
  });
});

const withFetch = (fetch: FetchLike) => ({
  ctx: createContext({fetch, userAgent: 'Ink2Pic/test', languages: ['en']}),
});

describe('the per-source time (#102)', () => {
  it('logs one line per source with its answer and time', async () => {
    let now = 0;
    const clock = {...systemClock, now: () => now};
    const slow = {
      name: 'slow',
      search: async (): Promise<SourceOutcome> => {
        now += 1200;
        return {ok: true, results: [result('s1'), result('s2')]};
      },
    };
    const down = answering('down', {
      ok: false,
      kind: 'throttled',
      message: 'HTTP 429',
    });
    const lines: string[] = [];
    const ctx = {
      ...withFetch(jest.fn()).ctx,
      log: (line: string) => lines.push(line),
    };
    await searchAll('soup', [slow, down], {ctx, clock});
    const times = lines.filter(line => line.startsWith('time source '));
    expect(times).toEqual([
      'time source slow: 1200 ms, 2 result(s)',
      expect.stringMatching(/^time source down: \d+ ms, failed throttled$/),
    ]);
  });
});

describe('the default adapters', () => {
  it('queries Openclipart, Commons and Wikidata with the given fetch, OpenMoji with none (#67)', async () => {
    jest.useFakeTimers();
    const fetch = jest
      .fn()
      .mockResolvedValue({ok: false, status: 503, text: jest.fn()});
    const pending = searchAll('soup', DEFAULT_ADAPTERS, withFetch(fetch));
    await jest.advanceTimersByTimeAsync(400);
    const outcome = await pending;
    expect(Object.keys(outcome.statuses)).toEqual([
      'openclipart',
      'commons',
      'wikidata',
      'openmoji',
    ]);
    // Off the network the symbols still answer, with the «source down» note.
    expect(outcome.statuses.openmoji.state).toBe('ok');
    expect(outcome.sourceDown).toBe(true);
    // A 5xx is tried once more (#65): two per source.
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it('ranks with the query: the plain picture of the word comes first (#43)', async () => {
    const titled = (id: string, title: string): SearchResult => ({
      ...result(id),
      title,
    });
    const outcome = await searchAll('cat', [
      answering('a', {
        ok: true,
        results: [
          titled('a1', 'Man walking past a house'),
          titled('a2', 'Cat'),
        ],
      }),
    ]);
    expect(outcome.results.map(x => x.id)).toEqual(['a2', 'a1']);
  });
});

describe('a failure beside an empty answer (#23)', () => {
  it('flags the failed source even when the other found nothing', async () => {
    const outcome = await searchAll('soup', [
      answering('a', {ok: false, kind: 'timeout', message: 'no answer'}),
      answering('b', {ok: true, results: []}),
    ]);
    expect(outcome.results).toEqual([]);
    expect(outcome.sourceDown).toBe(true);
    expect(outcome.allFailed).toBe(false);
  });
});

describe('sources of two requests and the supplement (#43)', () => {
  const soupDrawings = readFileSync(
    join(__dirname, 'fixtures', 'commons-soup.json'),
    'utf8',
  );
  /** Commons drawings answer after 4 s; the plain search never does, until its abort. */
  function slowSecondFetch(): FetchLike {
    return (url, {signal}) =>
      new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
        if (url.includes('commons') && url.includes('filetype%3Adrawing')) {
          setTimeout(
            () =>
              resolve({
                ok: true,
                status: 200,
                text: () => Promise.resolve(soupDrawings),
              }),
            4000,
          );
        } else if (!url.includes('commons')) {
          reject(new Error('offline'));
        }
      });
  }

  it('keeps the drawings Commons had when its second request runs out', async () => {
    jest.useFakeTimers();
    const pending = searchAll(
      'soup',
      DEFAULT_ADAPTERS,
      withFetch(slowSecondFetch()),
    );
    // 4 s for the drawings, then the plain search's own 5 s limit.
    await jest.advanceTimersByTimeAsync(9500);
    const outcome = await pending;
    // The fixture's two pictures; its audio file is left out.
    expect(outcome.statuses.commons).toEqual({state: 'ok', count: 2});
  });

  it('gives each request of a source its own budget', async () => {
    jest.useFakeTimers();
    const twoRequests: SourceAdapter = {
      name: 'b',
      requests: 2,
      search: () =>
        new Promise(resolve =>
          setTimeout(() => resolve({ok: true, results: [result('b1')]}), 7000),
        ),
    };
    const pending = searchAll('soup', [twoRequests], {timeoutMs: 5000});
    await jest.advanceTimersByTimeAsync(7000);
    expect((await pending).statuses.b).toEqual({state: 'ok', count: 1});
  });

  it('a supplement failing is no source down, and the search is still cached', async () => {
    const sources: SourceAdapter[] = [
      answering('a', {ok: true, results: [result('a1')]}),
      {
        ...answering('w', {ok: false, kind: 'network', message: 'refused'}),
        supplement: true,
      },
    ];
    const outcome = await searchAll('soup', sources);
    expect(outcome.sourceDown).toBe(false);
    expect(outcome.allFailed).toBe(false);
    const files: Record<string, string> = {};
    const cached = await cachedSearch(
      'soup',
      query => searchAll(query, sources),
      {
        storage: {
          readText: async path => files[path] ?? null,
          writeText: async (path, text) => {
            files[path] = text;
          },
        },
        path: '/plugin/search-cache.json',
      },
    );
    expect(await cached.saved).toBeNull();
  });

  it('offline, a search cached a week ago shows stale, though OpenMoji answers (#104)', async () => {
    jest.useFakeTimers();
    const files: Record<string, string> = {};
    const storage = {
      readText: async (path: string) => files[path] ?? null,
      writeText: async (path: string, text: string) => {
        files[path] = text;
      },
    };
    const then = Date.UTC(2026, 10, 1, 12);
    const week = 7 * 24 * 60 * 60 * 1000;
    const options = (now: number) => ({
      storage,
      path: '/plugin/search-cache.json',
      clock: {...systemClock, now: () => now},
    });
    const online = await cachedSearch(
      'soup',
      async () => ({
        results: [result('a1')],
        statuses: {openclipart: {state: 'ok', count: 1}},
        sourceDown: false,
        allFailed: false,
      }),
      options(then),
    );
    await online.saved;
    const fetch = jest.fn().mockRejectedValue(new Error('Network request failed'));
    const pending = cachedSearch(
      'soup',
      query => searchAll(query, DEFAULT_ADAPTERS, withFetch(fetch)),
      options(then + week),
    );
    await jest.advanceTimersByTimeAsync(30000);
    const offline = await pending;
    expect(fetch).toHaveBeenCalled();
    expect(offline.freshness).toBe('stale');
    expect(searchState(offline.outcome).kind).toBe('stale');
    expect(offline.outcome.results.map(x => x.id)).toEqual(['a1']);
  });

  it('Commons makes two requests, Wikidata one per language and two more; Wikidata only adds pictures', () => {
    const byName = Object.fromEntries(
      DEFAULT_ADAPTERS.map(source => [source.name, source]),
    );
    expect(byName.commons.requests).toBe(2);
    const {ctx} = withFetch(jest.fn());
    const wikidata = byName.wikidata.requests as (c: typeof ctx) => number;
    expect(wikidata(ctx)).toBe(3);
    expect(byName.wikidata.supplement).toBe(true);
    expect(byName.openclipart.supplement).toBeUndefined();
  });
});

describe('the corrected search (#65)', () => {
  const suggesting = (
    name: string,
    answers: Record<string, SourceOutcome>,
  ): SourceAdapter & {search: jest.Mock} => ({
    name,
    search: jest.fn(
      async (query: string) => answers[query] ?? {ok: true, results: []},
    ),
  });

  it('searches the suggestion once when the query found nothing', async () => {
    const commons = suggesting('commons', {
      'Confucious Institute': {
        ok: true,
        results: [],
        suggestion: 'confucius institute',
      },
      'confucius institute': {ok: true, results: [result('c1')]},
    });
    const clipart = suggesting('openclipart', {});
    const wikidata = {...suggesting('wikidata', {}), supplement: true as const};
    const outcome = await searchAll('Confucious Institute', [
      clipart,
      commons,
      wikidata,
    ]);
    expect(outcome.results.map(x => x.id)).toEqual(['c1']);
    expect(outcome.correctedQuery).toBe('confucius institute');
    expect(commons.search).toHaveBeenCalledTimes(2);
    expect(clipart.search).toHaveBeenLastCalledWith(
      'confucius institute',
      expect.anything(),
    );
    // The supplement is not asked again: the extra requests stay the main sources' own.
    expect(wikidata.search).toHaveBeenCalledTimes(1);
  });

  it('tries one suggestion at most, and keeps the empty answer when it finds nothing', async () => {
    const commons = suggesting('commons', {
      qzxv: {ok: true, results: [], suggestion: 'qzxw'},
      qzxw: {ok: true, results: [], suggestion: 'qzxy'},
    });
    const outcome = await searchAll('qzxv', [commons]);
    expect(outcome.results).toEqual([]);
    expect(outcome.correctedQuery).toBeUndefined();
    expect(commons.search).toHaveBeenCalledTimes(2);
  });

  it('never corrects a query that filled page 1, or an exact search', async () => {
    const found = suggesting('commons', {
      apple: {ok: true, results: page('a'), suggestion: 'apples'},
      apples: {ok: true, results: [result('s1')]},
    });
    const full = await searchAll('apple', [found]);
    expect(full.correctedQuery).toBeUndefined();
    expect(full.results.map(x => x.id)).toEqual(page('a').map(x => x.id));
    expect(found.search).toHaveBeenCalledTimes(1);
    const exact = suggesting('commons', {
      qzxv: {ok: true, results: [], suggestion: 'qzxw'},
      qzxw: {ok: true, results: [result('w1')]},
    });
    expect(
      (await searchAll('qzxv', [exact], {correct: false})).results,
    ).toEqual([]);
    expect(exact.search).toHaveBeenCalledTimes(1);
  });

  it('searches the suggestion once when page 1 is thin; its pictures lead (#84)', async () => {
    const commons = suggesting('commons', {
      'Confucious Institute': {
        ok: true,
        results: [result('c1'), result('c2')],
        suggestion: 'confucius institute',
      },
      'confucius institute': {
        ok: true,
        results: [result('k1'), result('c2'), result('k2')],
      },
    });
    const wikidata = {...suggesting('wikidata', {}), supplement: true as const};
    const outcome = await searchAll('Confucious Institute', [
      commons,
      wikidata,
    ]);
    expect(outcome.correctedQuery).toBe('confucius institute');
    expect(outcome.results.map(x => x.id)).toEqual(['k1', 'c2', 'k2', 'c1']);
    expect(commons.search).toHaveBeenCalledTimes(2);
    expect(wikidata.search).toHaveBeenCalledTimes(1);
    expect(searchState(outcome).kind).toBe('corrected');
  });

  it('a thin page tries only a suggestion, never a prefix or a longest word (#84)', async () => {
    const commons = suggesting('commons', {
      elephan: {ok: true, results: [result('e1')]},
      'elephan*': {ok: true, results: [result('e2')]},
    });
    const outcome = await searchAll('elephan', [commons]);
    expect(outcome.correctedQuery).toBeUndefined();
    expect(outcome.results.map(x => x.id)).toEqual(['e1']);
    expect(commons.search).toHaveBeenCalledTimes(1);
  });

  it('keeps the thin page when the suggestion finds nothing (#84)', async () => {
    const commons = suggesting('commons', {
      qzxv: {ok: true, results: [result('q1')], suggestion: 'qzxw'},
    });
    const outcome = await searchAll('qzxv', [commons]);
    expect(outcome.correctedQuery).toBeUndefined();
    expect(outcome.results.map(x => x.id)).toEqual(['q1']);
    expect(commons.search).toHaveBeenCalledTimes(2);
  });

  it('never corrects when every source failed', async () => {
    const down = answering('commons', {
      ok: false,
      kind: 'network',
      message: 'offline',
    });
    expect((await searchAll('soup', [down])).allFailed).toBe(true);
  });
});

describe('the circuit breaker (#65)', () => {
  let now = Date.UTC(2026, 10, 6, 12);
  const clock = {...systemClock, now: () => now};
  const down = () => ({
    name: 'down',
    search: jest.fn(
      async (): Promise<SourceOutcome> => ({
        ok: false,
        kind: 'throttled',
        message: 'HTTP 429',
      }),
    ),
  });
  const up = answering('up', {ok: true, results: [result('u1')]});

  it('skips a source for five minutes after two failed searches in a row', async () => {
    const breaker = createBreaker({clock});
    const source = down();
    const lines: string[] = [];
    const ctx = {
      ...withFetch(jest.fn()).ctx,
      log: (line: string) => lines.push(line),
    };
    await searchAll('soup', [up, source], {breaker, ctx});
    await searchAll('soup', [up, source], {breaker, ctx});
    expect(source.search).toHaveBeenCalledTimes(2);
    const skipped = await searchAll('soup', [up, source], {breaker, ctx});
    expect(source.search).toHaveBeenCalledTimes(2);
    expect(skipped.statuses.down).toEqual({
      state: 'skipped',
      kind: 'throttled',
      message: 'HTTP 429',
    });
    // The screen says one source did not answer.
    expect(skipped.sourceDown).toBe(true);
    expect(skipped.results.map(x => x.id)).toEqual(['u1']);
    expect(
      lines.some(line => line.startsWith('breaker: down failed twice')),
    ).toBe(true);
    expect(lines).toContain('breaker: down skipped: HTTP 429');
    now += BREAKER_OPEN_MS;
    await searchAll('soup', [up, source], {breaker, ctx});
    expect(source.search).toHaveBeenCalledTimes(3);
  });

  it('a success clears the count', async () => {
    const breaker = createBreaker({clock});
    let fail = true;
    const flaky: SourceAdapter = {
      name: 'flaky',
      search: jest.fn(
        async (): Promise<SourceOutcome> =>
          fail
            ? {ok: false, kind: 'http', message: 'HTTP 503'}
            : {ok: true, results: [result('f1')]},
      ),
    };
    await searchAll('soup', [up, flaky], {breaker});
    fail = false;
    await searchAll('soup', [up, flaky], {breaker});
    fail = true;
    await searchAll('soup', [up, flaky], {breaker});
    await searchAll('soup', [up, flaky], {breaker});
    expect(flaky.search).toHaveBeenCalledTimes(4);
  });

  it('never opens while no other source answers: the device is offline', async () => {
    const breaker = createBreaker({clock});
    const a = down();
    const b = {...down(), name: 'other'};
    for (let i = 0; i < 3; i++) {
      await searchAll('soup', [a, b], {breaker});
    }
    expect(a.search).toHaveBeenCalledTimes(3);
  });

  it('asks every main source when all their breakers are open', async () => {
    const breaker = createBreaker({clock});
    const a = down();
    const only = answering('w', {ok: true, results: []});
    const wikidata = {...only, supplement: true as const};
    await searchAll('cat', [a, wikidata], {breaker});
    await searchAll('cat', [a, wikidata], {breaker});
    await searchAll('cat', [a, wikidata], {breaker});
    expect(a.search).toHaveBeenCalledTimes(3);
  });
});

describe('the fallback ladder (#71)', () => {
  const finding = (found: Record<string, SearchResult[]>) => ({
    name: 'commons',
    search: jest.fn(
      async (query: string): Promise<SourceOutcome> => ({
        ok: true,
        results: found[query] ?? [],
      }),
    ),
  });

  it('searches a cut word as a prefix', async () => {
    const commons = finding({'elephan*': [result('e1')]});
    const outcome = await searchAll('elephan', [commons]);
    expect(outcome.correctedQuery).toBe('elephan*');
    expect(outcome.results.map(x => x.id)).toEqual(['e1']);
  });

  it('searches a phrase by its longest word', async () => {
    const commons = finding({relógio: [result('r1')]});
    const outcome = await searchAll('velho relógio de parede', [commons]);
    expect(outcome.correctedQuery).toBe('relógio');
  });

  it("prefers the sources' suggestion: Commons first, then Wikipedia", async () => {
    const commons = {
      name: 'commons',
      search: jest.fn(
        async (q: string): Promise<SourceOutcome> =>
          q === 'elefant'
            ? {ok: true, results: []}
            : {ok: true, results: q === 'elephant' ? [result('e1')] : []},
      ),
    };
    const wikipedia = {
      ...answering('wikidata', {ok: true, results: [], suggestion: 'elephant'}),
      supplement: true as const,
    };
    const outcome = await searchAll('elefant', [commons, wikipedia]);
    expect(outcome.correctedQuery).toBe('elephant');
    expect(commons.search).toHaveBeenCalledTimes(2);
  });

  it('runs one re-search at most, and none for a short word', async () => {
    const commons = finding({});
    await searchAll('elephan', [commons]);
    expect(commons.search).toHaveBeenCalledTimes(2);
    const short = finding({});
    await searchAll('cat', [short]);
    expect(short.search).toHaveBeenCalledTimes(1);
  });
});

describe('the source-down line shows only on a thin page (#82)', () => {
  const down = answering('commons', {
    ok: false,
    kind: 'http',
    message: 'HTTP 500',
  });
  const kind = async (results: SearchResult[], failed = down) =>
    searchState(
      await searchAll(
        'soup',
        [answering('openclipart', {ok: true, results}), failed],
        {
          correct: false,
        },
      ),
    ).kind;

  it('one full page is thin no more', () => {
    expect(isThin(PAGE_SIZE - 1)).toBe(true);
    expect(isThin(0)).toBe(true);
    expect(isThin(PAGE_SIZE)).toBe(false);
  });

  it('a full page 1 with a source down shows no line', async () => {
    expect(await kind(page('a'))).toBe('ready');
  });

  it('a thin page 1 with a source down says so', async () => {
    expect(await kind([result('a1'), result('a2')])).toBe('partial');
  });

  it('an empty page with a source down says so', async () => {
    expect(await kind([])).toBe('partial');
  });

  // OpenMoji answers from its bundled index, with no request (#67).
  const offline = (name: string) =>
    answering(name, {
      ok: false,
      kind: 'network',
      message: 'Network request failed',
    });
  const local = (name: string, results: SearchResult[]): SourceAdapter => ({
    ...answering(name, {ok: true, results}),
    localIndex: true,
  });
  const symbols = (...results: SearchResult[]) => local('openmoji', results);
  const offlineKind = async (...results: SearchResult[]) =>
    searchState(
      await searchAll(
        'soup',
        [offline('openclipart'), offline('commons'), symbols(...results)],
        {correct: false},
      ),
    ).kind;

  it('reads the local sources from the searched adapters, not the default list (#99)', async () => {
    const outcome = await searchAll(
      'soup',
      [offline('commons'), local('bundled', [result('b1')])],
      {correct: false},
    );
    expect(outcome.statuses.bundled).toEqual({
      state: 'ok',
      count: 1,
      local: true,
    });
    expect(outcome.statuses.commons.local).toBeUndefined();
    expect(searchState(outcome).kind).toBe('offline');
  });

  it('offline, a local index alone is no answer: the state is offline (#82)', async () => {
    expect(await offlineKind(result('o1'))).toBe('offline');
  });

  it('offline, a saved symbol is an answer (#82, #91)', async () => {
    const saved = {...result('o2'), offlinePicture: true as const};
    expect(await offlineKind(result('o1'), saved)).toBe('partial');
  });

  it('a local index beside one answering network source still counts it (#82)', async () => {
    const outcome = await searchAll(
      'soup',
      [
        answering('openclipart', {ok: true, results: page('a')}),
        down,
        symbols(result('o1')),
      ],
      {correct: false},
    );
    expect(searchState(outcome).kind).toBe('ready');
  });

  it('a source down for another reason than the network is not offline (#82)', async () => {
    const outcome = await searchAll(
      'soup',
      [down, offline('openclipart'), symbols(result('o1'))],
      {correct: false},
    );
    expect(searchState(outcome).kind).toBe('partial');
  });

  it('a failed supplement on a thin page says so too', async () => {
    const wikidata = {
      ...answering('wikidata', {ok: false, kind: 'timeout', message: 'x'}),
      supplement: true as const,
    };
    expect(await kind([result('a1')], wikidata)).toBe('partial');
    expect(await kind(page('a'), wikidata)).toBe('ready');
  });
});
