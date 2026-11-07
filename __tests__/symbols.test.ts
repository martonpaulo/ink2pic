/**
 * OpenMoji pictures kept for offline use (#91), through the PluginHost simulator (#78): a symbol
 * shown once is saved in MyStyle/Ink2Pic/symbols and shows and inserts with no network; with
 * none saved, no symbol shows offline; «Download symbols» resumes after it was cut off.
 */
import React from 'react';
import {Image, NativeModules} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import * as sdk from 'sn-plugin-lib';
import {runSearch} from '../src/flow/search';
import {insertPicture} from '../src/flow/insertPicture';
import {
  openmojiPictureUrl,
  SearchResult,
  symbolHexes,
} from '../src/search-core';
import * as openmoji from '../src/search-core/adapters/openmoji';
import {resetThumbsForTests, thumbUri} from '../src/search/thumbs';
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
import {ResultsGrid} from '../src/ui/ResultsGrid';
import {USER_AGENT} from '../src/config';
import {setAfterCall} from '../src/log/memory';
import {
  closeLogFileForTests,
  flushLogFile,
  openLogFile,
} from '../src/storage/logFile';
import {logsDir} from '../src/storage/paths';
import {createHost, PluginHost} from './host/pluginHost';

const {PluginManager} = sdk as unknown as Record<
  string,
  Record<string, (...args: any[]) => any>
>;
const PICTURES = 'raw.githubusercontent.com';
/** The session log bytes a whole «Download symbols» may write (#102). */
const LOG_BYTES_LIMIT = 1000 * 1000;
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

/**
 * Lets «Download symbols» fetch only the first `count` symbols, plus `keep`, and returns that
 * list: the whole 1,447 cost about 2 s a test alone and 17 s under parallel gates (#108). Only the
 * session log test downloads them all, since it measures the bytes of the whole run.
 */
function fewSymbols(count: number, keep: string[] = []): string[] {
  const few = [...new Set([...keep, ...symbolHexes().slice(0, count)])];
  jest.spyOn(openmoji, 'symbolHexes').mockReturnValue(few);
  return few;
}

beforeEach(() => resetSymbolsForTests());
afterEach(() => jest.restoreAllMocks());

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

  it('shows a saved symbol offline in a grid with no thumbnail store (#99)', async () => {
    const host = started();
    const [first] = await symbolResults();
    const file = `file://${symbolPath(first.id.slice('openmoji:'.length))}`;
    expect(await thumbUri(first, '/unused')).toBe(file);

    resetSymbolsForTests(); // a new session lists the folder again
    resetThumbsForTests(); // and its plugin folder is not listed: no store
    host.online = false;
    const offline = await symbolResults();
    expect(offline.map(r => r.id)).toEqual([first.id]);
    expect(await thumbUri(offline[0], '/unused')).toBe(file);
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        React.createElement(ResultsGrid, {
          results: offline,
          searching: false,
          onPick: () => {},
          thumbDir: null,
        }),
      );
    });
    const uris = tree.root
      .findAllByType(Image)
      .map(image => image.props.source.uri);
    expect(uris).toEqual([file]);
    act(() => tree.unmount());
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
    const status = await symbolsStatus();
    expect(status).toEqual({total: symbolHexes().length, saved: 0});
    // About 15 MB measured for the 1,447 PNGs (#91).
    expect(missingMegabytes(status)).toBe(15);

    const total = fewSymbols(40).length;
    const cut = await downloadAllSymbols(progress => {
      if (progress.saved === 10) {
        // The stream ends early: half of each file is written in place, then the call fails.
        host.cutOff.set(PICTURES, 'error');
      }
    });
    expect(cut.complete).toBe(false);
    expect(cut.saved).toBeGreaterThanOrEqual(10);
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
    const total = fewSymbols(20).length;
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

  it('lists by name and size, and checks the PNG end only of the symbol inserted (#102)', async () => {
    const host = started();
    const [symbol] = await symbolResults();
    const hex = symbol.id.slice('openmoji:'.length);
    fewSymbols(5, [hex]);
    await downloadAllSymbols(() => {});
    // A file cut off midway, the way a grid download can leave one.
    host.files.set(symbolPath(hex), {bytes: 100, order: 0, truncated: true});
    resetSymbolsForTests();
    const checks = () =>
      host.calls.filter(c => c.name === 'isCompletePng').length;
    const before = checks();
    await symbolResults();
    expect(host.calls.some(c => c.name === 'listSizes')).toBe(true);
    // The listing opened no file: a search checks none while the network is up.
    expect(checks()).toBe(before);
    expect(savedSymbolPath(symbol)).not.toBeNull();
    // The insert checks it, finds it cut off, and downloads the picture instead.
    expect(await symbolFile(symbol)).toBeNull();
    expect(checks()).toBe(before + 1);
    expect(savedSymbolPath(symbol)).toBeNull();
    // The grid saves it again, whole.
    expect(await thumbUri(symbol, '/unused')).toBe(`file://${symbolPath(hex)}`);
    expect(host.files.get(symbolPath(hex))?.truncated).toBeUndefined();
  });

  it('appends the session log during «Download symbols» (#102)', async () => {
    const host = started();
    const log = `${logsDir()}/session.log`;
    openLogFile(logsDir());
    setAfterCall(flushLogFile);
    try {
      await downloadAllSymbols(() => {});
      await flushLogFile();
    } finally {
      setAfterCall(() => {});
      closeLogFileForTests();
    }
    const writes = host.calls.filter(
      c =>
        (c.name === 'writeText' || c.name === 'appendText') &&
        c.args[0] === log,
    );
    const rewrites = writes.filter(c => c.name === 'writeText');
    const bytes = writes.reduce((sum, c) => sum + String(c.args[1]).length, 0);
    const file = host.files.get(log)?.text ?? '';
    // Two logged calls per symbol (its download and its PNG check), each flushed once.
    const total = symbolHexes().length;
    expect(writes.length).toBeLessThanOrEqual(2 * total + 3);
    // The first write, then one each time the file reaches LOG_FILE_REWRITE_LINES.
    expect(rewrites.length).toBeLessThanOrEqual(3);
    // Each line is written about once, plus the rewrites: under 0.5 MB measured, where every flush
    // rewrote up to 2,000 lines before #102, 56 MB for the same run.
    expect(bytes).toBeLessThan(LOG_BYTES_LIMIT);
    expect(file).toMatch(/symbols: 1447 of 1447 saved, 0 failed\n$/);
  });

  it('lists the folder again after a failed listing, and downloads nothing meanwhile (#99)', async () => {
    const host = started();
    const [first] = await symbolResults();
    await thumbUri(first, '/unused'); // saved
    resetSymbolsForTests();
    const total = symbolHexes().length;
    jest
      .spyOn(NativeModules.Ink2PicFiles, 'listSizes')
      .mockRejectedValueOnce(new Error('EIO'));
    expect(await symbolsStatus()).toEqual({total, saved: 0, unreadable: true});
    const before = pictureRequests(host).length;
    // A failure that is not cached: this listing works, so nothing is downloaded again.
    jest
      .spyOn(NativeModules.Ink2PicFiles, 'listSizes')
      .mockRejectedValueOnce(new Error('EIO'));
    expect(await downloadAllSymbols(() => {})).toEqual({
      total,
      saved: 0,
      unreadable: true,
      complete: false,
      failed: 0,
      stopped: true,
    });
    expect(pictureRequests(host).length).toBe(before);
    expect(await symbolsStatus()).toEqual({total, saved: 1});
    expect(savedSymbolPath(first)).not.toBeNull();
  });

  // Last: its failed searches open the sources' breaker for the rest of the file.
  it('shows no symbol offline when none is saved', async () => {
    const host = started();
    host.online = false;
    expect(await symbolResults()).toEqual([]);
  });
});
