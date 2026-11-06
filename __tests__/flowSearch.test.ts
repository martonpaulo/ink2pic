import {afterSearch, runSearch} from '../src/flow/search';
import {getLibrary, recordSearch} from '../src/library/device';
import {emptyLibrary} from '../src/library/library';
import {logLines, startLog} from '../src/log/memory';
import {searchCached} from '../src/search/device';
import type {SearchOutcome} from '../src/search-core/search';
import {prepareThumbs} from '../src/search/thumbs';
import {hasPermission} from '../src/sdk/plugin';
import {copy} from '../src/ui/copy';

jest.mock('../src/search/device', () => ({searchCached: jest.fn()}));
jest.mock('../src/search/thumbs', () => ({prepareThumbs: jest.fn()}));
jest.mock('../src/library/device', () => ({
  getLibrary: jest.fn(),
  recordSearch: jest.fn(),
}));
jest.mock('../src/sdk/plugin', () => ({
  PERMISSION_INTERNET: 'plugin.permission.INTERNET',
  hasPermission: jest.fn(),
}));

const found: SearchOutcome = {
  results: [],
  statuses: {openclipart: {state: 'ok', count: 0}},
  sourceDown: false,
  allFailed: false,
};
const offline: SearchOutcome = {
  results: [],
  statuses: {
    openclipart: {state: 'failed', kind: 'network', message: 'down'},
  },
  sourceDown: false,
  allFailed: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  startLog();
  jest.mocked(searchCached).mockResolvedValue(found);
  jest.mocked(prepareThumbs).mockResolvedValue('/p');
  jest.mocked(getLibrary).mockResolvedValue(emptyLibrary());
  jest.mocked(recordSearch).mockResolvedValue();
  jest.mocked(hasPermission).mockResolvedValue({ok: true, value: true});
});
afterEach(() => jest.restoreAllMocks());

describe('runSearch (#54)', () => {
  it('gives the outcome and the thumbnail folder, and logs each source', async () => {
    expect(await runSearch('soup', [])).toEqual({
      outcome: found,
      thumbDir: '/p',
    });
    expect(logLines().join('\n')).toMatch(/source openclipart: /);
  });

  it('ignores an answer that a newer search overtook (#33)', async () => {
    const run = await runSearch('soup', [], () => false);
    expect(run).toEqual({outcome: null, thumbDir: '/p'});
    expect(logLines().join('\n')).toMatch(/ended after a newer one/);
  });
});

describe('afterSearch (#54)', () => {
  it('records a search that reached a source', async () => {
    expect(await afterSearch('soup', found)).toEqual({library: emptyLibrary()});
    expect(recordSearch).toHaveBeenCalledWith('soup');
  });

  it('gives the offline sentence and records nothing without a network', async () => {
    expect(await afterSearch('soup', offline)).toEqual({
      offline: copy['error.offline'],
    });
    expect(recordSearch).not.toHaveBeenCalled();
  });

  it('records nothing when every source failed for another reason', async () => {
    const down: SearchOutcome = {
      ...offline,
      statuses: {openclipart: {state: 'failed', kind: 'http', message: '500'}},
    };
    expect(await afterSearch('soup', down)).toBeNull();
    expect(recordSearch).not.toHaveBeenCalled();
  });
});
