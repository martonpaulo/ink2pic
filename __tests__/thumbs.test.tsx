import React from 'react';
import {Image, NativeModules} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {PluginManager} from 'sn-plugin-lib';
import {resetSessionForTests} from '../src/storage/session';
import {closeLogFileForTests} from '../src/storage/logFile';
import {
  cachedThumbUri,
  prepareThumbs,
  resetThumbsForTests,
  THUMB_LIMIT,
  thumbPath,
  thumbUri,
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
    license: 'CC0 1.0',
    attribution: 'Openclipart',
  };
}

const native = {
  downloadToFile: jest.fn(),
  downloadThumbToFile: jest.fn(),
  deleteFile: jest.fn(),
  writeText: jest.fn(),
  readText: jest.fn(),
  listDir: jest.fn(),
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  NativeModules.Ink2PicFiles = native;
  resetSessionForTests();
  resetThumbsForTests();
  closeLogFileForTests();
  (PluginManager.getPluginDirPath as jest.Mock).mockResolvedValue(DIR);
  native.readText.mockResolvedValue(null);
  native.writeText.mockResolvedValue(null);
  native.downloadToFile.mockResolvedValue(42000);
  native.downloadThumbToFile.mockResolvedValue(42000);
  native.deleteFile.mockResolvedValue(true);
  native.listDir.mockResolvedValue([]);
});

const fileUri = (n: number) => `file://${THUMBS}/openclipart-${n}`;
const downloaded = () =>
  native.downloadThumbToFile.mock.calls.map(call => call[1]);

describe('thumbnail files (#16, #46)', () => {
  it('names a safe file under the thumbs folder', () => {
    expect(thumbPath(DIR, result(7))).toBe(`${THUMBS}/openclipart-7`);
  });

  it('reads the file when it is stored, else the web URL', () => {
    const stored = new Set([`${THUMBS}/openclipart-7`]);
    const has = (path: string) => stored.has(path);
    expect(cachedThumbUri(result(7), DIR, has)).toBe(fileUri(7));
    expect(cachedThumbUri(result(8), DIR, has)).toBe(result(8).thumbUrl);
  });

  it('downloads a missing thumbnail once, as a background download, and renders the file', async () => {
    await prepareThumbs();
    const [first, second] = await Promise.all([
      thumbUri(result(1), DIR),
      thumbUri(result(1), DIR),
    ]);
    expect(first).toBe(fileUri(1));
    expect(second).toBe(fileUri(1));
    expect(await thumbUri(result(1), DIR)).toBe(fileUri(1));
    expect(downloaded()).toEqual([`${THUMBS}/openclipart-1`]);
    // The insert's own download is never used for a thumbnail.
    expect(native.downloadToFile).not.toHaveBeenCalled();
    expect(cachedThumbUri(result(1), DIR)).toBe(fileUri(1));
  });

  it('skips stored thumbnails, listed by name, and ignores part files', async () => {
    native.listDir.mockResolvedValue([
      'openclipart-1',
      'openclipart-2',
      'openclipart-3.part',
    ]);
    await prepareThumbs();
    for (const n of [1, 2, 3]) {
      expect(await thumbUri(result(n), DIR)).toBe(fileUri(n));
    }
    expect(downloaded()).toEqual([`${THUMBS}/openclipart-3`]);
  });

  it('falls back to the web URL when the download fails, and keeps it off the list', async () => {
    await prepareThumbs();
    native.downloadThumbToFile.mockRejectedValue(
      Object.assign(new Error('HTTP 503'), {code: 'HTTP_503'}),
    );
    expect(await thumbUri(result(1), DIR)).toBe(result(1).thumbUrl);
    expect(cachedThumbUri(result(1), DIR)).toBe(result(1).thumbUrl);
  });

  it('removes the oldest file first at the limit', async () => {
    native.listDir.mockResolvedValue(
      Array.from({length: THUMB_LIMIT}, (_, n) => `old-${n}`),
    );
    await prepareThumbs();
    expect(await thumbUri(result(1), DIR)).toBe(fileUri(1));
    expect(native.deleteFile.mock.calls.map(call => call[0])).toEqual([
      `${THUMBS}/old-0`,
    ]);
  });

  it('removes a different old file for each download running at the limit', async () => {
    native.listDir.mockResolvedValue(
      Array.from({length: THUMB_LIMIT}, (_, n) => `old-${n}`),
    );
    await prepareThumbs();
    await Promise.all([1, 2, 3].map(n => thumbUri(result(n), DIR)));
    expect(native.deleteFile.mock.calls.map(call => call[0])).toEqual([
      `${THUMBS}/old-0`,
      `${THUMBS}/old-1`,
      `${THUMBS}/old-2`,
    ]);
    expect(downloaded()).toHaveLength(3);
  });

  it('loads from the web without downloading when an old file cannot be removed', async () => {
    native.listDir.mockResolvedValue(
      Array.from({length: THUMB_LIMIT}, (_, n) => `old-${n}`),
    );
    native.deleteFile.mockRejectedValue(
      Object.assign(new Error('denied'), {code: 'IO'}),
    );
    await prepareThumbs();
    expect(await thumbUri(result(1), DIR)).toBe(result(1).thumbUrl);
    expect(native.downloadThumbToFile).not.toHaveBeenCalled();
    expect(cachedThumbUri({...result(0), id: 'old-0'}, DIR)).toBe(
      `file://${THUMBS}/old-0`,
    );
  });

  it('starts empty when the folder does not exist yet', async () => {
    native.listDir.mockResolvedValue(null);
    expect(await prepareThumbs()).toBe(DIR);
    expect(await thumbUri(result(1), DIR)).toBe(fileUri(1));
  });

  it('turns the store off when the folder cannot be listed', async () => {
    native.listDir.mockRejectedValue(
      Object.assign(new Error('denied'), {code: 'IO'}),
    );
    expect(await prepareThumbs()).toBeNull();
    expect(await thumbUri(result(1), DIR)).toBe(result(1).thumbUrl);
    expect(native.downloadThumbToFile).not.toHaveBeenCalled();
  });

  it('never stores a library file', async () => {
    await prepareThumbs();
    const local = {...result(1), thumbUrl: 'file:///lib/a.png'};
    expect(await thumbUri(local, DIR)).toBe('file:///lib/a.png');
    expect(native.downloadThumbToFile).not.toHaveBeenCalled();
    expect(cachedThumbUri(local, DIR)).toBe('file:///lib/a.png');
  });
});

describe('the grid with stored thumbnails (#16, #46)', () => {
  function grid(
    results: SearchResult[],
    contourThumbs?: ReadonlyMap<string, string>,
  ): ReactTestRenderer {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ResultsGrid
          results={results}
          searching={false}
          sourceDown={false}
          onPick={jest.fn()}
          thumbDir={DIR}
          contourThumbs={contourThumbs}
        />,
      );
    });
    return tree;
  }

  it('reads stored files at once and downloads the rest before their tiles render', async () => {
    native.listDir.mockResolvedValue(['openclipart-1']);
    await prepareThumbs();
    let finish!: (bytes: number) => void;
    native.downloadThumbToFile.mockReturnValue(
      new Promise(resolve => (finish = resolve)),
    );
    const tree = grid([result(1), result(2)]);
    const uris = () =>
      tree.root.findAllByType(Image).map(img => img.props.source.uri);
    expect(uris()).toEqual([fileUri(1)]);
    await act(async () => {});
    expect(uris()).toEqual([fileUri(1)]);
    expect(downloaded()).toEqual([`${THUMBS}/openclipart-2`]);
    await act(async () => finish(42000));
    expect(uris()).toEqual([fileUri(1), fileUri(2)]);
    act(() => tree.unmount());
  });

  it('retries a file that cannot be shown once from the web, then marks it failed (#46)', async () => {
    native.listDir.mockResolvedValue(['openclipart-1']);
    await prepareThumbs();
    const tree = grid([result(1)]);
    const image = () => tree.root.findAllByType(Image)[0];
    expect(image().props.source.uri).toBe(fileUri(1));
    // Fresco cannot read the extension-less file, or it was not complete yet.
    act(() => image().props.onError());
    expect(image().props.source.uri).toBe(result(1).thumbUrl);
    act(() => image().props.onError());
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('shows the contour drawing of a converted picture (#66)', async () => {
    native.listDir.mockResolvedValue(['openclipart-1', 'openclipart-2']);
    await prepareThumbs();
    const contour = `file://${THUMBS}/openclipart-1.contour.png`;
    const tree = grid(
      [result(1), result(2)],
      new Map([[result(1).id, contour]]),
    );
    expect(
      tree.root.findAllByType(Image).map(img => img.props.source.uri),
    ).toEqual([contour, fileUri(2)]);
    act(() => tree.unmount());
  });

  it('marks a library file failed at once: it has no web copy', async () => {
    await prepareThumbs();
    const local = {...result(1), thumbUrl: 'file:///lib/a.png'};
    const tree = grid([local]);
    act(() => tree.root.findAllByType(Image)[0].props.onError());
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('costs one request per thumbnail on a new page (audit: two)', async () => {
    await prepareThumbs();
    const results = Array.from({length: 6}, (_, n) => result(n + 1));
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = grid(results);
    });
    const webUris = new Set<string>();
    // Every render the page goes through until it shows, so a tile that changes its URI counts.
    for (let round = 0; round < 3; round++) {
      const images = tree.root.findAllByType(Image);
      images
        .map(img => img.props.source.uri as string)
        .filter(uri => uri.startsWith('https://'))
        .forEach(uri => webUris.add(uri));
      await act(async () => images.forEach(img => img.props.onLoad()));
    }
    const requests =
      webUris.size +
      native.downloadThumbToFile.mock.calls.length +
      native.downloadToFile.mock.calls.length;
    expect(requests).toBe(results.length);
    expect(
      tree.root.findByProps({testID: 'grid'}).props.style,
    ).not.toContainEqual(expect.objectContaining({opacity: 0}));
    act(() => tree.unmount());
  });
});
