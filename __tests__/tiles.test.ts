import {PAGE_SIZE} from '../src/search/pages';
import type {SearchResult} from '../src/search-core/types';
import {
  initialTile,
  nextTile,
  type Tile,
  tilePage,
  tileUri,
} from '../src/ui/tiles';

const WEB = 'https://commons.wikimedia.org/thumb/1.png';
const FILE = 'file:///data/plugin/thumbs/commons-1';
const result = (n: number, thumbUrl = WEB): SearchResult => ({
  id: `commons:${n}`,
  source: 'commons',
  title: `Picture ${n}`,
  thumbUrl,
  license: 'CC0 1.0',
  attribution: 'Wikimedia Commons',
});

describe('tile state (#46, #64)', () => {
  it('starts downloading without a URI, else shows the chosen one', () => {
    expect(initialTile(null)).toEqual({status: 'download'});
    expect(tileUri(initialTile(null))).toBeNull();
    expect(initialTile(FILE)).toEqual({status: 'show', uri: FILE});
  });

  it('shows a downloaded file, then is ready when it loads', () => {
    const shown = nextTile(
      initialTile(null),
      {type: 'downloaded', uri: FILE},
      result(1),
    );
    expect(shown).toEqual({status: 'show', uri: FILE});
    expect(nextTile(shown, {type: 'loaded'}, result(1))).toEqual({
      status: 'ready',
      uri: FILE,
    });
  });

  it('retries a stored file once from the web, then fails', () => {
    const retry = nextTile(initialTile(FILE), {type: 'error'}, result(1));
    expect(retry).toEqual({status: 'retry', uri: WEB});
    expect(nextTile(retry, {type: 'error'}, result(1))).toEqual({
      status: 'failed',
    });
  });

  it('fails at once when there is no web copy to retry', () => {
    const web = initialTile(WEB);
    expect(nextTile(web, {type: 'error'}, result(1)).status).toBe('failed');
    const library = initialTile('file:///lib/a.png');
    expect(
      nextTile(library, {type: 'error'}, result(1, 'file:///lib/a.png')).status,
    ).toBe('failed');
  });

  it('fails an unanswered tile on timeout, but keeps a loaded one', () => {
    expect(nextTile(initialTile(FILE), {type: 'timeout'}, result(1))).toEqual({
      status: 'failed',
    });
    const ready: Tile = {status: 'ready', uri: FILE};
    for (const type of ['timeout', 'error'] as const) {
      expect(nextTile(ready, {type}, result(1))).toBe(ready);
    }
  });

  it('ignores a late download and a load with nothing shown', () => {
    const shown = initialTile(FILE);
    expect(
      nextTile(shown, {type: 'downloaded', uri: 'file:///other'}, result(1)),
    ).toBe(shown);
    const download = initialTile(null);
    expect(nextTile(download, {type: 'loaded'}, result(1))).toBe(download);
  });
});

describe('tilePage (#64)', () => {
  const results = Array.from({length: PAGE_SIZE + 2}, (_, i) => result(i + 1));
  const failing =
    (...ns: number[]) =>
    (r: SearchResult): Tile =>
      ns.some(n => r.id === `commons:${n}`)
        ? {status: 'failed'}
        : initialTile(WEB);
  const ids = (page: {visible: SearchResult[]}) =>
    page.visible.map(r => Number(r.id.split(':')[1]));

  it('fills a failed place from the next result, and the page count follows', () => {
    expect(tilePage(results, failing(), 0)).toMatchObject({pages: 2});
    const cut = tilePage(results, failing(3), 0);
    expect(ids(cut)).toEqual([1, 2, 4, 5, 6, 7]);
    expect(cut).toMatchObject({page: 0, pages: 2, empty: false});
    expect(tilePage(results, failing(3, 8), 0).pages).toBe(1);
  });

  it('keeps the open page on the last page left', () => {
    const cut = tilePage(results, failing(7, 8), 1);
    expect(cut.page).toBe(0);
    expect(ids(cut)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('is empty when every result failed', () => {
    const all = results.map((_, i) => i + 1);
    expect(tilePage(results, failing(...all), 0)).toMatchObject({
      visible: [],
      page: 0,
      pages: 1,
      empty: true,
    });
  });
});
