import {searchAll, Source} from '../src/search/search';
import {defaultSources} from '../src/search/sources';
import type {SearchResult, SourceOutcome} from '../src/sources/types';

const result = (id: string): SearchResult => ({
  id,
  source: 'openclipart',
  title: id,
  thumbUrl: 'https://example.test/t',
  fullUrl: () => 'https://example.test/f',
  license: 'CC0 1.0',
  attribution: 'x',
});
const answering = (name: string, outcome: SourceOutcome): Source => ({
  name,
  search: () => Promise.resolve(outcome),
});
const never = (name: string): Source => ({
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

describe('defaultSources', () => {
  it('queries Openclipart and Commons with the given fetch', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue({ok: false, status: 503, text: jest.fn()});
    const outcome = await searchAll('soup', defaultSources(fetch));
    expect(Object.keys(outcome.statuses)).toEqual(['openclipart', 'commons']);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
