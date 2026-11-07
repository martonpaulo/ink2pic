/**
 * The five integration gaps of #111, through the PluginHost simulator (#78): an early download
 * that is not used leaves no file, a double tap on Probe or Lasso last word runs once, a pen-up
 * already being handled lassoes nothing after Stop probe, and the remembered word is taken only
 * on its own page. The two writers of one file are in FileWritesTest.java.
 */
import React from 'react';
import {NativeModules} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import * as sdk from 'sn-plugin-lib';
import {insertPicture, startEarlyDownload} from '../src/flow/insertPicture';
import {rememberPick, readLassoQuery} from '../src/flow/lassoQuery';
import {probeIdle, runProbe, stopPenProbe} from '../src/flow/penProbe';
import {runSearch} from '../src/flow/search';
import {resetLibraryForTests} from '../src/library/device';
import {resetSymbolsForTests} from '../src/symbols/store';
import {thumbUri} from '../src/search/thumbs';
import {ProbeBar} from '../src/ui/ProbeBar';
import {copy} from '../src/ui/copy';
import type {SearchResult} from '../src/search-core/types';
import {
  createHost,
  NOTE_PATH,
  PLUGIN_DIR,
  PluginHost,
  STROKE_TYPE,
  success,
} from './host/pluginHost';

const {PluginManager} = sdk as unknown as Record<
  string,
  Record<string, (...args: any[]) => any>
>;
const OPTIONS = {width: 640, placement: 'below' as const, contour: false};
const LADLE: SearchResult = {
  id: 'openclipart:340609',
  source: 'openclipart',
  title: 'Ladle',
  thumbUrl: 'https://openclipart.org/image/400px/340609',
  license: 'CC0 1.0',
  attribution: 'Openclipart',
};
/** Event-loop turns for a dropped early download's background removal. */
const TURNS = 50;

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

async function turns(count = TURNS): Promise<void> {
  for (let i = 0; i < count; i++) {
    await new Promise(resolve => setImmediate(resolve));
  }
}

const earlyFiles = (host: PluginHost) =>
  [...host.files.keys()].filter(path =>
    path.startsWith(`${PLUGIN_DIR}/insert-early-`),
  );

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  resetLibraryForTests();
  resetSymbolsForTests();
  stopPenProbe();
  rememberPick(null);
});
afterEach(() => {
  stopPenProbe();
  jest.restoreAllMocks();
});

describe('an early download that is not used (#111, item 1)', () => {
  it('is removed when the library already holds the tile’s contour drawing', async () => {
    const host = started();
    expect((await insertPicture(LADLE, 'ladle', null, true, OPTIONS)).ok).toBe(
      true,
    );
    // «All contour» is off, so the early download fetches the plain picture.
    const early = startEarlyDownload(LADLE);
    expect(await early.raw).toEqual(expect.objectContaining({ok: true}));
    expect(earlyFiles(host)).toHaveLength(1);
    const again = await insertPicture(LADLE, 'ladle', null, true, OPTIONS, early);
    expect(again.ok).toBe(true);
    await turns();
    expect(earlyFiles(host)).toEqual([]);
  });

  it('is never started for a saved symbol', async () => {
    const host = started();
    const run = await runSearch('happy', undefined, undefined, {exact: true});
    const symbol = (run.outcome?.results ?? []).find(
      r => r.source === 'openmoji',
    );
    expect(symbol).toBeDefined();
    await thumbUri(symbol!, '/unused'); // saves the symbol, as the grid does
    const early = startEarlyDownload(symbol!);
    await early.raw;
    const inserted = await insertPicture(symbol!, 'happy', null, false, OPTIONS, early);
    expect(inserted.ok).toBe(true);
    await turns();
    expect(earlyFiles(host)).toEqual([]);
    expect(
      host.called('downloadToFile').filter(call => /insert-early-/.test(String(call.args[1]))),
    ).toEqual([]);
  });
});

describe('a double tap on the probe buttons (#111, item 3)', () => {
  const penUpListeners = (host: PluginHost) =>
    host
      .called('registerEventListener')
      .filter(call => call.args[0] === 'event_pen_up');

  it('two Probe runs at once register one pen-up listener', async () => {
    const host = started();
    await Promise.all([runProbe(), runProbe()]);
    expect(penUpListeners(host)).toHaveLength(1);
  });

  async function bar(): Promise<ReactTestRenderer> {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ProbeBar />);
    });
    return tree;
  }

  async function doubleTap(tree: ReactTestRenderer, label: string) {
    const button = tree.root.find(
      node => node.props.label === label && typeof node.props.onPress === 'function',
    );
    await act(async () => {
      await Promise.all([button.props.onPress(), button.props.onPress()]);
    });
  }

  it('a double tap on Probe registers the listeners once', async () => {
    const host = started();
    const tree = await bar();
    await doubleTap(tree, copy['probe.run']);
    expect(penUpListeners(host)).toHaveLength(1);
    act(() => tree.unmount());
  });

  it('a double tap on Lasso last word reads the page once', async () => {
    const host = started();
    const tree = await bar();
    await doubleTap(tree, copy['probe.lastWord']);
    expect(host.called('getElements')).toHaveLength(1);
    act(() => tree.unmount());
  });
});

type Point = {x: number; y: number};

/** A stroke as the SDK hands it over, with these points. */
function stroke(points: Point[], numInPage: number) {
  return {
    uuid: `s${numInPage}`,
    type: STROKE_TYPE,
    numInPage,
    stroke: {
      points: {
        size: async () => points.length,
        getRange: async (start: number, count: number) =>
          points.slice(start, start + count),
      },
    },
    recycle: async () => {},
  };
}

const zigzag = (left: number): Point[] =>
  Array.from({length: 11}, (_, i) => ({x: left + i * 4, y: 100 + (i % 2) * 40}));

const loop = (): Point[] =>
  Array.from({length: 40}, (_, i) => {
    const angle = (2 * Math.PI * i) / 39;
    return {x: 175 + 140 * Math.cos(angle), y: 120 + 60 * Math.sin(angle)};
  });

describe('a pen-up being handled when Stop probe is tapped (#111, item 4)', () => {
  /** A circle drawn around two letters; `during` runs while its last element is read. */
  async function circleAround(host: PluginHost, during: () => void) {
    const letters = [stroke(zigzag(100), 1), stroke(zigzag(150), 2)];
    const circle = stroke(loop(), 3);
    host.script('getLastElement', async () => {
      during();
      return success(circle);
    });
    host.script('getElements', async () => success([...letters, circle]));
    host.write('o', {left: 30, top: 60, right: 320, bottom: 180});
    await probeIdle();
    await turns();
  }

  it('lassoes the word inside the circle while the probe listens', async () => {
    const host = started();
    await runProbe();
    const before = host.called('lassoElements').length;
    await circleAround(host, () => {});
    expect(host.called('lassoElements').length).toBe(before + 1);
  });

  it('lassoes nothing once Stop probe was tapped meanwhile', async () => {
    const host = started();
    await runProbe();
    const before = host.called('lassoElements').length;
    await circleAround(host, stopPenProbe);
    expect(host.called('lassoElements').length).toBe(before);
  });
});

describe('the word Lasso last word remembered (#111, item 5)', () => {
  const rect = {left: 100, top: 200, right: 300, bottom: 260};
  /** What Lasso last word leaves after lassoing «tomato soup» on `page` of the note. */
  const pickOn = (page: number) => ({
    query: 'tomato soup',
    rect,
    strokes: 1,
    path: NOTE_PATH,
    page,
  });

  it('is not taken by the same lasso on another page', async () => {
    const host = started();
    rememberPick(pickOn(host.page));
    host.turnPage(host.page + 1);
    host.write('ladle', rect);
    host.lassoAround(rect);
    const read = await readLassoQuery();
    expect(read).toEqual(expect.objectContaining({ok: true}));
    expect(read.ok && read.value.query).toBe('ladle');
    expect(host.called('recognizeElements')).toHaveLength(1);
  });

  it('is taken by that lasso on its own page', async () => {
    const host = started();
    host.write('tomato', rect);
    host.lassoAround(rect);
    rememberPick(pickOn(host.page));
    const read = await readLassoQuery();
    expect(read.ok && read.value.query).toBe('tomato soup');
    expect(host.called('recognizeElements')).toHaveLength(0);
  });
});
