/** The library on the device writes only on a change, and its page survives a render (#46). */
import React from 'react';
import {NativeModules, Text, TextInput} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {FileUtils, PluginManager} from 'sn-plugin-lib';
import {resetSessionForTests} from '../src/flow/session';
import {
  getLibrary,
  oldSourcesRemovedForTests,
  recordSearch,
  resetLibraryForTests,
} from '../src/library/device';
import {LIBRARY_VERSION} from '../src/library/library';
import type {LibraryItem} from '../src/library/types';
import {closeLogFileForTests} from '../src/log/file';
import {copy} from '../src/ui/copy';
import {SearchScreen} from '../src/ui/SearchScreen';

const SHARED_LIBRARY =
  '/storage/emulated/0/MyStyle/Ink2Pic/library/library.json';
const files: Record<string, string> = {};
const native = {
  readText: jest.fn(async (path: string) => files[path] ?? null),
  writeText: jest.fn(async (path: string, text: string) => {
    files[path] = text;
    return null;
  }),
  listDir: jest.fn(async (_path: string): Promise<string[] | null> => []),
  deleteLibrarySource: jest.fn(async (path: string) => {
    delete files[path];
    return 1000;
  }),
};
const LIBRARY_DIR = '/storage/emulated/0/MyStyle/Ink2Pic/library';

const item = (n: number): LibraryItem => ({
  id: `openclipart:${n}`,
  source: 'openclipart',
  sourceId: String(n),
  sourceUrl: `https://openclipart.org/detail/${n}`,
  query: `word ${n}`,
  license: 'CC0 1.0',
  attribution: 'Openclipart',
  savedAt: '2026-11-06T12:00:00.000Z',
  path: `/storage/emulated/0/MyStyle/Ink2Pic/library/openclipart-${n}.png`,
  width: 640,
  height: 593,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  for (const key of Object.keys(files)) {
    delete files[key];
  }
  NativeModules.Ink2PicFiles = native;
  resetSessionForTests();
  resetLibraryForTests();
  closeLogFileForTests();
  (FileUtils.getExternalDirPath as jest.Mock).mockResolvedValue([
    '/storage/emulated/0',
  ]);
  (PluginManager.getPluginDirPath as jest.Mock).mockResolvedValue('/p');
});

const libraryWrites = () =>
  native.writeText.mock.calls.filter(call => call[0] === SHARED_LIBRARY);

it('writes library.json only when the recent searches change', async () => {
  files[SHARED_LIBRARY] = JSON.stringify({
    version: LIBRARY_VERSION,
    items: [],
    recentSearches: [],
    sourcesRemoved: true,
  });
  await getLibrary();
  await recordSearch('soup');
  expect(libraryWrites()).toHaveLength(1);
  await recordSearch(' soup ');
  await recordSearch('   ');
  expect(libraryWrites()).toHaveLength(1);
  await recordSearch('bread');
  expect(libraryWrites()).toHaveLength(2);
  expect(JSON.parse(files[SHARED_LIBRARY]).recentSearches).toEqual([
    'bread',
    'soup',
  ]);
});

it('keeps the Library page when the screen renders again', async () => {
  files[SHARED_LIBRARY] = JSON.stringify({
    version: LIBRARY_VERSION,
    items: Array.from({length: 7}, (_, n) => item(n + 1)),
    recentSearches: [],
  });
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SearchScreen
        initialQuery=""
        lassoFailure={null}
        onPick={jest.fn()}
        onClose={jest.fn()}
        sources={[]}
      />,
    );
  });
  const pageNumber = () =>
    tree.root
      .findAllByType(Text)
      .map(text => text.props.children)
      .find(child => typeof child === 'string' && child.includes(' / '));
  expect(pageNumber()).toBe('1 / 2');
  const next = tree.root.findByProps({
    accessibilityLabel: copy['nav.nextLabel'],
  });
  act(() => next.props.onPress());
  expect(pageNumber()).toBe('2 / 2');
  act(() => tree.root.findByType(TextInput).props.onChangeText('so'));
  expect(pageNumber()).toBe('2 / 2');
  act(() => tree.unmount());
});

describe('the .source files older builds left (#57)', () => {
  const old = (name: string) => `${LIBRARY_DIR}/${name}`;
  const inserted = {
    ...item(9),
    path: old('openclipart-9.source.png'),
  };

  beforeEach(() => {
    files[SHARED_LIBRARY] = JSON.stringify({
      version: LIBRARY_VERSION,
      items: [inserted],
      recentSearches: [],
    });
    native.listDir.mockResolvedValue([
      'library.json',
      'openclipart-1.png',
      'openclipart-1.source.png',
      'commons-7.source.jpg',
      'openclipart-9.source.png',
    ]);
  });

  it('removes them once per install, keeping a file the library names', async () => {
    await getLibrary();
    await oldSourcesRemovedForTests();
    expect(native.listDir).toHaveBeenCalledWith(LIBRARY_DIR);
    expect(native.deleteLibrarySource.mock.calls.map(call => call[0])).toEqual([
      old('openclipart-1.source.png'),
      old('commons-7.source.jpg'),
    ]);
    expect(JSON.parse(files[SHARED_LIBRARY]).sourcesRemoved).toBe(true);

    resetLibraryForTests();
    native.listDir.mockClear();
    await getLibrary();
    await oldSourcesRemovedForTests();
    expect(native.listDir).not.toHaveBeenCalled();
    expect(native.deleteLibrarySource).toHaveBeenCalledTimes(2);
  });

  it('tries again next session when a delete fails', async () => {
    native.deleteLibrarySource.mockRejectedValueOnce(
      Object.assign(new Error('denied'), {code: 'IO'}),
    );
    await getLibrary();
    await oldSourcesRemovedForTests();
    expect(JSON.parse(files[SHARED_LIBRARY]).sourcesRemoved).toBeUndefined();
  });
});
