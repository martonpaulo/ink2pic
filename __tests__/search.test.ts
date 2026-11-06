import {readFileSync} from 'fs';
import {join} from 'path';
import {cachedSearch} from '../src/search-core/cache';
import type {SourceAdapter} from '../src/search-core/adapter';
import {searchAll} from '../src/search-core/search';
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
      kind: 'network',
      message: 'boom',
    });
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
  ctx: createContext({fetch, userAgent: 'Ink2Pic/test'}),
});

describe('the default adapters', () => {
  it('queries Openclipart, Commons and Wikidata with the given fetch', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue({ok: false, status: 503, text: jest.fn()});
    const outcome = await searchAll('soup', DEFAULT_ADAPTERS, withFetch(fetch));
    expect(Object.keys(outcome.statuses)).toEqual([
      'openclipart',
      'commons',
      'wikidata',
    ]);
    // A failed request is never retried: one per source.
    expect(fetch).toHaveBeenCalledTimes(3);
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

  it('Commons and Wikidata make two requests; Wikidata only adds pictures', () => {
    const byName = Object.fromEntries(
      DEFAULT_ADAPTERS.map(source => [source.name, source]),
    );
    expect(byName.commons.requests).toBe(2);
    expect(byName.wikidata.requests).toBe(2);
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

  it('never corrects a query that found pictures, or an exact search', async () => {
    const found = suggesting('commons', {
      apple: {ok: true, results: [result('a1')], suggestion: 'apples'},
    });
    expect((await searchAll('apple', [found])).correctedQuery).toBeUndefined();
    const exact = suggesting('commons', {
      qzxv: {ok: true, results: [], suggestion: 'qzxw'},
      qzxw: {ok: true, results: [result('w1')]},
    });
    expect(
      (await searchAll('qzxv', [exact], {correct: false})).results,
    ).toEqual([]);
    expect(exact.search).toHaveBeenCalledTimes(1);
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
