import React from 'react';
import {Image, NativeModules} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {FileUtils, PluginManager} from 'sn-plugin-lib';
import {resetSessionForTests} from '../src/flow/session';
import {closeLogFileForTests} from '../src/log/file';
import {
  cachedThumbUri,
  prepareThumbs,
  resetThumbsForTests,
  storeThumbs,
  THUMB_LIMIT,
  thumbPath,
} from '../src/search/thumbs';
import type {SearchResult} from '../src/sources/types';
import {ResultsGrid} from '../src/ui/ResultsGrid';

const DIR = '/data/plugin';
const THUMBS = `${DIR}/thumbs`;

function result(n: number): SearchResult {
  return {
    id: `openclipart:${n}`,
    source: 'openclipart',
    title: `Picture ${n}`,
    thumbUrl: `https://openclipart.org/image/400px/${n}`,
    fullUrl: w => `https://openclipart.org/image/${w}px/${n}`,
    license: 'CC0 1.0',
    attribution: 'Openclipart',
  };
}

const native = {
  downloadToFile: jest.fn(),
  writeText: jest.fn(),
  readText: jest.fn(),
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  NativeModules.Ink2PicFiles = native;
  resetSessionForTests();
  resetThumbsForTests();
  closeLogFileForTests();
  (PluginManager.getPluginDirPath as jest.Mock).mockResolvedValue(DIR);
  (FileUtils.getExternalDirPath as jest.Mock).mockResolvedValue([
    '/storage/emulated/0',
  ]);
  native.readText.mockResolvedValue(null);
  native.writeText.mockResolvedValue(null);
  native.downloadToFile.mockResolvedValue(42000);
  (FileUtils.listFiles as jest.Mock).mockResolvedValue([]);
});

describe('thumbnail files (#16)', () => {
  it('names a safe file under the thumbs folder', () => {
    expect(thumbPath(DIR, result(7))).toBe(`${THUMBS}/openclipart-7`);
  });

  it('reads the file when it is stored, else the web URL', () => {
    const stored = new Set([`${THUMBS}/openclipart-7`]);
    const has = (path: string) => stored.has(path);
    expect(cachedThumbUri(result(7), DIR, has)).toBe(
      `file://${THUMBS}/openclipart-7`,
    );
    expect(cachedThumbUri(result(8), DIR, has)).toBe(result(8).thumbUrl);
  });

  it('stores a shown page one after another, then reads it from the device', async () => {
    expect(await prepareThumbs()).toBe(DIR);
    expect(cachedThumbUri(result(1), DIR)).toBe(result(1).thumbUrl);
    let running = 0;
    native.downloadToFile.mockImplementation(async () => {
      running += 1;
      expect(running).toBe(1);
      await Promise.resolve();
      running -= 1;
      return 42000;
    });
    await storeThumbs([result(1), result(2)], DIR);
    expect(native.downloadToFile.mock.calls.map(call => call[1])).toEqual([
      `${THUMBS}/openclipart-1`,
      `${THUMBS}/openclipart-2`,
    ]);
    expect(cachedThumbUri(result(1), DIR)).toBe(
      `file://${THUMBS}/openclipart-1`,
    );
  });

  it('skips stored thumbnails, listed by name or path, and ignores part files', async () => {
    (FileUtils.listFiles as jest.Mock).mockResolvedValue([
      'openclipart-1',
      `${THUMBS}/openclipart-2`,
      'openclipart-3.part',
    ]);
    await prepareThumbs();
    await storeThumbs([result(1), result(2), result(3)], DIR);
    expect(native.downloadToFile).toHaveBeenCalledTimes(1);
    expect(native.downloadToFile.mock.calls[0][1]).toBe(
      `${THUMBS}/openclipart-3`,
    );
  });

  it('keeps a failed download off the stored list', async () => {
    await prepareThumbs();
    native.downloadToFile.mockRejectedValue(
      Object.assign(new Error('HTTP 503'), {code: 'HTTP_503'}),
    );
    await storeThumbs([result(1)], DIR);
    expect(cachedThumbUri(result(1), DIR)).toBe(result(1).thumbUrl);
  });

  it('stores nothing past the limit', async () => {
    (FileUtils.listFiles as jest.Mock).mockResolvedValue(
      Array.from({length: THUMB_LIMIT}, (_, n) => `old-${n}`),
    );
    await prepareThumbs();
    await storeThumbs([result(1)], DIR);
    expect(native.downloadToFile).not.toHaveBeenCalled();
  });

  it('starts empty when the folder does not exist yet', async () => {
    (FileUtils.listFiles as jest.Mock).mockRejectedValue(new Error('no dir'));
    (FileUtils.exists as jest.Mock).mockResolvedValue(false);
    expect(await prepareThumbs()).toBe(DIR);
    await storeThumbs([result(1)], DIR);
    expect(native.downloadToFile).toHaveBeenCalledTimes(1);
  });

  it('turns the cache off when the folder cannot be listed', async () => {
    (FileUtils.listFiles as jest.Mock).mockRejectedValue(new Error('denied'));
    (FileUtils.exists as jest.Mock).mockResolvedValue(true);
    expect(await prepareThumbs()).toBeNull();
    await storeThumbs([result(1)], DIR);
    expect(native.downloadToFile).not.toHaveBeenCalled();
  });

  it('never stores a library file', async () => {
    await prepareThumbs();
    const local = {...result(1), thumbUrl: 'file:///lib/a.png'};
    await storeThumbs([local], DIR);
    expect(native.downloadToFile).not.toHaveBeenCalled();
    expect(cachedThumbUri(local, DIR)).toBe('file:///lib/a.png');
  });
});

describe('the grid with stored thumbnails (#16)', () => {
  it('reads stored files at once and stores the rest only after the page shows', async () => {
    (FileUtils.listFiles as jest.Mock).mockResolvedValue(['openclipart-1']);
    await prepareThumbs();
    const results = [result(1), result(2)];
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ResultsGrid
          results={results}
          searching={false}
          sourceDown={false}
          onPick={jest.fn()}
          thumbDir={DIR}
        />,
      );
    });
    const images = tree.root.findAllByType(Image);
    expect(images.map(img => img.props.source.uri)).toEqual([
      `file://${THUMBS}/openclipart-1`,
      result(2).thumbUrl,
    ]);
    expect(native.downloadToFile).not.toHaveBeenCalled();
    await act(async () => images.forEach(img => img.props.onLoad()));
    expect(native.downloadToFile.mock.calls.map(call => call[1])).toEqual([
      `${THUMBS}/openclipart-2`,
    ]);
    act(() => tree.unmount());
  });
});
