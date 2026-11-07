import {PluginManager} from 'sn-plugin-lib';
import {insertBest, QuickInsertDeps} from '../src/flow/quickInsert';
import {unmeasured} from '../src/flow/measure';
import type {SearchOutcome, SearchResult} from '../src/search-core';
import {copy} from '../src/ui/copy';

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
    measure: jest.fn().mockImplementation(async (results: SearchResult[]) => ({
      ...unmeasured([...results].reverse()),
      contourThumbs: new Map([[second.id, 'file:///p/2.contour.png']]),
    })),
    insert: jest.fn().mockResolvedValue({ok: true, value: '/s/2.png'}),
    record: jest.fn().mockResolvedValue(null),
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
    expect(d.search).toHaveBeenCalledWith('soup');
    expect(d.measure).toHaveBeenCalledWith([first, second], '/p', 'soup');
    // As a contour drawing when its tile shows one, the same as a tap on it (#66).
    expect(d.insert).toHaveBeenCalledWith(second, 'soup', place, true);
    expect(d.insert).toHaveBeenCalledTimes(1);
    // A recent search, after the insert: one library write at a time.
    expect(d.record).toHaveBeenCalledWith('soup', found);
    expect(d.record.mock.invocationCallOrder[0]).toBeGreaterThan(
      d.insert.mock.invocationCallOrder[0],
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
