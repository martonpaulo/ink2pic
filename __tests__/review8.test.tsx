/** Regression tests for the review of build 0.1.0 (8) (#33). */
import React from 'react';
import {NativeModules} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {
  FileUtils,
  PluginCommAPI,
  PluginManager,
  PluginNoteAPI,
} from 'sn-plugin-lib';
import {insertPicture} from '../src/flow/insertPicture';
import {resetSessionForTests} from '../src/storage/session';
import {
  getLibrary,
  recordSearch,
  resetLibraryForTests,
} from '../src/library/device';
import {
  closeLogFileForTests,
  openLogFile,
  startSession,
} from '../src/storage/logFile';
import type {Done} from '../src/flow/failure';
import type {SourceAdapter} from '../src/search-core';
import type {SearchResult} from '../src/search-core/types';
import {SearchScreen} from '../src/ui/SearchScreen';

const files: Record<string, string> = {};
const native = {
  downloadToFile: jest.fn().mockResolvedValue(100),
  readText: jest.fn(async (path: string) => files[path] ?? null),
  writeText: jest.fn(async (path: string, text: string) => {
    files[path] = text;
    return null;
  }),
  listDir: jest.fn().mockResolvedValue(null),
};
const result: SearchResult = {
  id: 'openclipart:1',
  source: 'openclipart',
  title: 'Soup',
  thumbUrl: 'https://openclipart.org/image/400px/1',
  license: 'CC0 1.0',
  attribution: 'Openclipart',
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  for (const key of Object.keys(files)) {
    delete files[key];
  }
  NativeModules.Ink2PicFiles = native;
  NativeModules.Ink2PicImage = {
    prepareForEink: jest
      .fn()
      .mockResolvedValue({width: 640, height: 600, bytes: 1}),
  };
  resetSessionForTests();
  resetLibraryForTests();
  closeLogFileForTests();
  (FileUtils.getExternalDirPath as jest.Mock).mockResolvedValue(['/s']);
  (PluginManager.getPluginDirPath as jest.Mock).mockResolvedValue('/p');
  (PluginNoteAPI.insertImage as jest.Mock).mockResolvedValue({
    success: true,
    result: true,
  });
});
afterEach(() => jest.useRealTimers());

const SHARED_LIBRARY =
  '/storage/emulated/0/MyStyle/Ink2Pic/library/library.json';

it('never overwrites a library file it could not read', async () => {
  files[SHARED_LIBRARY] = '{"version": 99}';
  expect((await getLibrary()).items).toEqual([]);
  await recordSearch('soup');
  expect(files[SHARED_LIBRARY]).toBe('{"version": 99}');
});

it('lists again the pictures an older build left, when library.json is missing (#61)', async () => {
  const dir = '/storage/emulated/0/MyStyle/Ink2Pic/library';
  native.listDir.mockResolvedValueOnce([
    'openclipart-1.png',
    'insert-download.png',
    'commons-2.png',
    'openclipart-3.source.png',
  ]);
  const library = await getLibrary();
  expect(library.items.map(item => [item.id, item.path, item.license])).toEqual(
    [
      ['commons:2', `${dir}/commons-2.png`, 'unknown'],
      ['openclipart:1', `${dir}/openclipart-1.png`, 'CC0 1.0'],
    ],
  );
  expect(JSON.parse(files[SHARED_LIBRARY]).items).toHaveLength(2);
});

it('keeps an existing library.json as it is, without listing the folder (#61)', async () => {
  files[SHARED_LIBRARY] = JSON.stringify({
    version: 1,
    items: [],
    recentSearches: ['napoleon'],
  });
  expect((await getLibrary()).recentSearches).toEqual(['napoleon']);
  expect(native.listDir).not.toHaveBeenCalled();
});

it('does not fall back to insertImage after a placement timeout', async () => {
  jest.useFakeTimers();
  (PluginCommAPI.createElement as jest.Mock).mockResolvedValue({
    success: true,
    result: {},
  });
  (PluginCommAPI.insertPageElements as jest.Mock).mockReturnValue(
    new Promise(() => {}),
  );
  const place = {
    rect: {left: 0, top: 0, right: 1, bottom: 1},
    page: 0,
    pageSize: {width: 1920, height: 2560},
  };
  const pending = insertPicture(result, 'soup', place);
  await jest.advanceTimersByTimeAsync(25000);
  expect((await pending).ok).toBe(false);
  expect(PluginNoteAPI.insertImage).not.toHaveBeenCalled();
});

it('keeps the previous session log on each press', async () => {
  openLogFile('/s/MyStyle/Ink2Pic/logs');
  files['/s/MyStyle/Ink2Pic/logs/session.log'] = 'first press';
  await startSession();
  expect(files['/s/MyStyle/Ink2Pic/logs/session.prev.log']).toBe('first press');
});

describe('SearchScreen', () => {
  it('runs one insert at a time and keeps the newest search', async () => {
    let finishFirst: (value: unknown) => void = () => {};
    const slow = new Promise(resolve => {
      finishFirst = resolve;
    });
    const search = jest
      .fn()
      .mockImplementationOnce(() => slow)
      .mockResolvedValue({
        ok: true,
        results: [{...result, id: 'openclipart:2', title: 'Wine'}],
      });
    const sources: SourceAdapter[] = [{name: 'openclipart', search}];
    const onPick = jest.fn((): Promise<Done<unknown>> => new Promise(() => {}));
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <SearchScreen
          initialQuery="soup"
          lassoFailure={null}
          onPick={onPick}
          onClose={jest.fn()}
          sources={sources}
        />,
      );
    });
    await act(async () =>
      tree.root.findByProps({testID: 'query'}).props.onChangeText('wine'),
    );
    await act(async () =>
      tree.root.findByProps({testID: 'query'}).props.onSubmitEditing(),
    );
    await act(async () => finishFirst({ok: true, results: [result]}));
    expect(
      tree.root.findAllByProps({testID: 'tile-openclipart:2'}).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAllByProps({testID: 'tile-openclipart:1'}),
    ).toHaveLength(0);
    const tile = tree.root.findByProps({testID: 'tile-openclipart:2'});
    act(() => {
      tile.props.onPress();
      tile.props.onPress();
    });
    expect(onPick).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });
});
