/** The library on the device writes only on a change, and its page survives a render (#46). */
import React from 'react';
import {NativeModules, Text, TextInput} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {FileUtils, PluginManager} from 'sn-plugin-lib';
import {resetSessionForTests} from '../src/storage/session';
import {
  getLibrary,
  itemsFromFiles,
  recordSearch,
  resetLibraryForTests,
} from '../src/library/device';
import {LIBRARY_VERSION} from '../src/library/library';
import type {LibraryItem} from '../src/library/types';
import {closeLogFileForTests} from '../src/storage/logFile';
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
  listDir: jest.fn(async () => []),
  deleteFile: jest.fn(),
};

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
  contour: false,
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

it('says on the Library page that library.json was unreadable (#104)', async () => {
  files[SHARED_LIBRARY] = 'not json';
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
  const texts = tree.root
    .findAllByType(Text)
    .map(text => text.props.children);
  expect(texts).toContain(copy['library.unreadableRebuilt']);
  expect(native.deleteFile).not.toHaveBeenCalled();
  act(() => tree.unmount());
});

it('clears the list and the recent searches, never a file (#70)', async () => {
  const {clearLibrary, recordInsert} = jest.requireActual(
    '../src/library/device',
  ) as typeof import('../src/library/device');
  await recordInsert(item(1));
  await recordSearch('soup');
  expect(await clearLibrary()).toBe(true);
  expect(JSON.parse(files[SHARED_LIBRARY])).toEqual({
    version: LIBRARY_VERSION,
    items: [],
    recentSearches: [],
  });
  expect(await getLibrary()).toEqual({items: [], recentSearches: []});
  expect(native.deleteFile).not.toHaveBeenCalled();
});

describe('a library rebuilt from its folder (#61)', () => {
  it('keeps each file\'s style from its name (#103)', () => {
    const items = itemsFromFiles('/lib', [
      'openclipart-1.png',
      'openclipart-1.contour.png',
      'openclipart-2.original.png',
    ]);
    expect(items.map(one => [one.path, one.contour])).toEqual([
      ['/lib/openclipart-1.png', false],
      ['/lib/openclipart-1.contour.png', true],
    ]);
  });
});
