import {PluginManager} from 'sn-plugin-lib';
import {insertBest, QuickInsertDeps} from '../src/flow/quickInsert';
import {unmeasured} from '../src/flow/measure';
import type {SearchOutcome, SearchResult} from '../src/search-core';
import {copy} from '../src/ui/copy';
import {logLines, startLog} from '../src/log/memory';

const picture = (id: string): SearchResult => ({
  id,
  source: 'openclipart',
  title: id,
  thumbUrl: `https://openclipart.org/image/400px/${id}`,
  license: 'CC0 1.0',
  attribution: 'Openclipart',
});
const first = picture('openclipart:1');
const second = picture('openclipart:2');
const place = {
  rect: {left: 100, top: 200, right: 300, bottom: 260},
  page: 3,
  pageSize: {width: 1920, height: 2560},
};

function outcome(results: SearchResult[], more: Partial<SearchOutcome> = {}) {
  return {
    results,
    statuses: {},
    sourceDown: false,
    allFailed: false,
    ...more,
  };
}

function deps(found: SearchOutcome): QuickInsertDeps & {
  [K in keyof QuickInsertDeps]: jest.Mock;
} {
  return {
    search: jest.fn().mockResolvedValue({outcome: found, thumbDir: '/p'}),
    // The grid's page 1 order: the pixels put the second result first (#66).
    // Page 1's thumbnails are on the device before the order is known (#88).
    measure: jest
      .fn()
      .mockImplementation(
        async (
          results: SearchResult[],
          _dir: string,
          _word: string,
          _deps: unknown,
          onThumbs?: () => void,
        ) => {
          onThumbs?.();
          return {
            ...unmeasured([...results].reverse()),
            contourThumbs: new Map([[second.id, 'file:///p/2.contour.png']]),
          };
        },
      ),
    insert: jest.fn().mockResolvedValue({ok: true, value: '/s/2.png'}),
    record: jest.fn().mockResolvedValue(null),
    early: jest.fn().mockImplementation((result: SearchResult) => ({
      id: result.id,
      started: 0,
      raw: Promise.resolve({ok: true, value: `/data/plugin/${result.id}`}),
    })),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

describe('Insert picture inserts the best result at once (#74)', () => {
  it('inserts the first picture of page 1 as the grid shows it, at the lasso', async () => {
    const found = outcome([first, second]);
    const d = deps(found);
    expect(await insertBest('soup', place, d)).toEqual({
      ok: true,
      value: '/s/2.png',
    });
    expect(d.search).toHaveBeenCalledWith('soup', undefined, undefined, {
      noTimerWait: true,
    });
    expect(d.measure.mock.calls[0].slice(0, 3)).toEqual([
      [first, second],
      '/p',
      'soup',
    ]);
    // As a contour drawing when its tile shows one, the same as a tap on it (#66). The early
    // download of the search's first picture is dropped: the measured order chose another (#88).
    expect(d.early).toHaveBeenCalledWith(first);
    expect(d.insert).toHaveBeenCalledWith(
      second,
      'soup',
      place,
      true,
      undefined,
      null,
      expect.any(Function),
    );
    expect(d.insert).toHaveBeenCalledTimes(1);
    // A recent search, after the insert: one library write at a time.
    expect(d.record).toHaveBeenCalledWith('soup', found);
    expect(d.record.mock.invocationCallOrder[0]).toBeGreaterThan(
      d.insert.mock.invocationCallOrder[0],
    );
  });

  it('inserts with the early download when its picture wins, and logs each step time (#88)', async () => {
    const d = deps(outcome([first, second]));
    d.measure.mockImplementation(
      async (
        results: SearchResult[],
        _dir: string,
        _word: string,
        _deps: unknown,
        onThumbs?: () => void,
      ) => {
        onThumbs?.();
        return unmeasured(results);
      },
    );
    startLog();
    await insertBest('soup', place, d);
    const early = d.early.mock.results[0].value;
    expect(early.id).toBe(first.id);
    expect(d.insert).toHaveBeenCalledWith(
      first,
      'soup',
      place,
      false,
      undefined,
      early,
      expect.any(Function),
    );
    const text = logLines().join('\n');
    expect(text).toMatch(/time search: \d+ ms, 2 results/);
    expect(text).toMatch(/time thumbnails: \d+ ms, 0 of 2 measured/);
    expect(text).toMatch(/time total: \d+ ms/);
  });

  it('starts no early download when the thumbnails never all arrive (#88)', async () => {
    const d = deps(outcome([first, second]));
    d.measure.mockImplementation(async (results: SearchResult[]) =>
      unmeasured(results),
    );
    await insertBest('soup', place, d);
    expect(d.early).not.toHaveBeenCalled();
    expect(d.insert).toHaveBeenCalledWith(
      first,
      'soup',
      place,
      false,
      undefined,
      null,
      expect.any(Function),
    );
  });

  it('says nothing was found, and inserts nothing', async () => {
    const d = deps(outcome([]));
    expect(await insertBest('xyzzy', place, d)).toEqual({
      ok: false,
      text: copy['search.empty'],
    });
    expect(d.insert).not.toHaveBeenCalled();
    expect(d.record).not.toHaveBeenCalled();
  });

  it('says the sources are down when every source failed', async () => {
    const d = deps(
      outcome([], {
        allFailed: true,
        statuses: {
          openclipart: {state: 'failed', kind: 'http', message: 'HTTP 503'},
        },
      }),
    );
    expect(await insertBest('soup', place, d)).toEqual({
      ok: false,
      text: copy['error.sourcesDown'],
    });
  });

  it('says there is no network when the search found none', async () => {
    (PluginManager.hasPermission as jest.Mock).mockResolvedValue(1);
    const d = deps(
      outcome([], {
        allFailed: true,
        statuses: {
          openclipart: {state: 'failed', kind: 'network', message: 'offline'},
        },
      }),
    );
    expect(await insertBest('soup', place, d)).toEqual({
      ok: false,
      text: copy['error.offline'],
    });
  });

  it('shows the failed insert sentence, the same as after a tap in the grid', async () => {
    const d = deps(outcome([first]));
    d.insert.mockResolvedValue({
      ok: false,
      code: 107,
      message: 'bad element',
      step: 'place',
    });
    expect(await insertBest('soup', place, d)).toEqual({
      ok: false,
      text: copy['error.place'],
    });
    expect(d.record).not.toHaveBeenCalled();
  });
});
