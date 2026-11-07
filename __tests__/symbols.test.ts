/**
 * OpenMoji pictures kept for offline use (#91), through the PluginHost simulator (#78): a symbol
 * shown once is saved in MyStyle/Ink2Pic/symbols and shows and inserts with no network; with
 * none saved, no symbol shows offline; «Download symbols» resumes after it was cut off.
 */
import {NativeModules} from 'react-native';
import * as sdk from 'sn-plugin-lib';
import {runSearch} from '../src/flow/search';
import {insertPicture} from '../src/flow/insertPicture';
import {
  openmojiPictureUrl,
  SearchResult,
  symbolHexes,
} from '../src/search-core';
import {thumbUri} from '../src/search/thumbs';
import {
  DOWNLOAD_PARALLEL,
  downloadAllSymbols,
  missingMegabytes,
  resetSymbolsForTests,
  savedSymbolPath,
  symbolFile,
  symbolPath,
  STOP_AFTER_FAILURES,
  symbolsStatus,
} from '../src/symbols/store';
import {USER_AGENT} from '../src/config';
import {createHost, PluginHost} from './host/pluginHost';

const {PluginManager} = sdk as unknown as Record<
  string,
  Record<string, (...args: any[]) => any>
>;
const PICTURES = 'raw.githubusercontent.com';
const WORD = 'happy';
const OPTIONS = {
  width: 640,
  placement: 'below' as const,
  contour: false,
};

function started(): PluginHost {
  const host = createHost().install(
    sdk as unknown as Record<string, Record<string, unknown>>,
    NativeModules,
  );
  PluginManager.init();
  host.grantDeclared();
  host.press(1);
  return host;
}

const pictureRequests = (host: PluginHost) =>
  host.requests.filter(url => url.includes(PICTURES));

async function symbolResults() {
  const run = await runSearch(WORD, undefined, undefined, {exact: true});
  return (run.outcome?.results ?? []).filter(r => r.source === 'openmoji');
}

beforeEach(() => resetSymbolsForTests());

describe('offline symbols (#91)', () => {
  it('shows and inserts a symbol seen once, with no network, from the symbols folder', async () => {
    const host = started();
    const [first, ...others] = await symbolResults();
    expect(first).toBeDefined();
    expect(first.offlinePicture).toBeUndefined();
    const uri = await thumbUri(first, '/unused');
    const path = symbolPath(first.id.slice('openmoji:'.length));
    expect(uri).toBe(`file://${path}`);
    expect(path).toMatch(/\/MyStyle\/Ink2Pic\/symbols\/[0-9A-F-]+\.png$/);
    expect(host.files.has(path)).toBe(true);

    resetSymbolsForTests(); // a new session lists the folder again
    host.online = false;
    const before = pictureRequests(host).length;
    const offline = await symbolResults();
    expect(offline.map(r => r.id)).toEqual([first.id]);
    expect(offline[0].offlinePicture).toBe(true);
    expect(others.length).toBeGreaterThan(0);
    expect(await thumbUri(offline[0], '/unused')).toBe(`file://${path}`);
    const inserted = await insertPicture(
      offline[0],
      WORD,
      null,
      false,
      OPTIONS,
    );
    expect(inserted.ok).toBe(true);
    expect(pictureRequests(host).length).toBe(before);
  });

  it('saves a symbol inserted from the search, for the next time', async () => {
    const host = started();
    const hex = '2744'; // not inserted by an earlier test, whose library the module keeps
    const symbol: SearchResult = {
      id: `openmoji:${hex}`,
      source: 'openmoji',
      title: 'snowflake',
      thumbUrl: openmojiPictureUrl(hex),
      license: 'CC BY-SA 4.0',
      attribution: 'OpenMoji',
      mime: 'image/png',
    };
    const inserted = await insertPicture(symbol, WORD, null, false, OPTIONS);
    expect(inserted.ok).toBe(true);
    expect(host.files.has(symbolPath(hex))).toBe(true);
  });

  it('never counts a symbol whose download was cut off without an error', async () => {
    const host = started();
    const hex = '1F327'; // cloud with rain
    const symbol: SearchResult = {
      id: `openmoji:${hex}`,
      source: 'openmoji',
      title: 'cloud with rain',
      thumbUrl: openmojiPictureUrl(hex),
      license: 'CC BY-SA 4.0',
      attribution: 'OpenMoji',
      mime: 'image/png',
    };
    host.cutOff.set(PICTURES, 'silent');
    // The grid falls back to the web picture, and the half file is not saved.
    expect(await thumbUri(symbol, '/unused')).toBe(symbol.thumbUrl);
    expect(host.files.get(symbolPath(hex))?.truncated).toBe(true);
    expect(savedSymbolPath(symbol)).toBeNull();
    resetSymbolsForTests(); // a new session lists the folder again
    expect(await symbolFile(symbol)).toBeNull();
    // The next save writes over it in place, with no delete.
    host.cutOff.delete(PICTURES);
    expect(await thumbUri(symbol, '/unused')).toBe(`file://${symbolPath(hex)}`);
    expect(host.files.get(symbolPath(hex))?.truncated).toBeUndefined();
  });

  it('states the size, downloads politely, stops when cut off and resumes', async () => {
    const host = started();
    const total = symbolHexes().length;
    const status = await symbolsStatus();
    expect(status).toEqual({total, saved: 0});
    // About 15 MB measured for the 1,447 PNGs (#91).
    expect(missingMegabytes(status)).toBe(15);

    const cut = await downloadAllSymbols(progress => {
      if (progress.saved === 100) {
        // The stream ends early: half of each file is written in place, then the call fails.
        host.cutOff.set(PICTURES, 'error');
      }
    });
    expect(cut.complete).toBe(false);
    expect(cut.saved).toBeGreaterThanOrEqual(100);
    expect(cut.saved).toBeLessThan(total);
    // It stops after a few failures in a row: no request for each of the 1,447 (#104).
    expect(cut.stopped).toBe(true);
    expect(pictureRequests(host).length).toBeLessThanOrEqual(
      cut.saved + STOP_AFTER_FAILURES + DOWNLOAD_PARALLEL,
    );

    // Each cut-off file stays on the device, but no new session counts it as saved.
    const partial = [...host.files.entries()].filter(([, e]) => e.truncated);
    expect(partial.length).toBeGreaterThan(0);
    host.cutOff.delete(PICTURES);
    resetSymbolsForTests();
    expect(await symbolsStatus()).toEqual({total, saved: cut.saved});
    const before = pictureRequests(host).length;
    const resumed = await downloadAllSymbols(() => {});
    expect(resumed).toEqual({
      total,
      saved: total,
      complete: true,
      failed: 0,
      stopped: false,
    });
    // Only the missing ones are asked for, each once, with the plugin's User-Agent.
    expect(pictureRequests(host).length - before).toBe(total - cut.saved);
    const calls = host.calls.filter(c => c.name === 'downloadThumbToFile');
    expect(
      calls.every(
        c => (c.args[2] as Record<string, string>)['User-Agent'] === USER_AGENT,
      ),
    ).toBe(true);
    expect(await symbolsStatus()).toEqual({total, saved: total});
  });

  it('skips a symbol that always fails and finishes the rest (#104)', async () => {
    const host = started();
    const total = symbolHexes().length;
    const [broken] = symbolHexes();
    host.failing.set(openmojiPictureUrl(broken), 404);
    const end = await downloadAllSymbols(() => {});
    expect(end).toEqual({
      total,
      saved: total - 1,
      complete: false,
      failed: 1,
      stopped: false,
    });
    expect(await symbolsStatus()).toEqual({total, saved: total - 1});
  });

  // Last: its failed searches open the sources' breaker for the rest of the file.
  it('shows no symbol offline when none is saved', async () => {
    const host = started();
    host.online = false;
    expect(await symbolResults()).toEqual([]);
  });
});
