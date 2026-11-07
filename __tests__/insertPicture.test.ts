import {NativeModules} from 'react-native';
import {FileUtils, PluginCommAPI, PluginNoteAPI} from 'sn-plugin-lib';
import {
  imageExtension,
  insertPicture,
  startEarlyDownload,
} from '../src/flow/insertPicture';
import {logLines, startLog} from '../src/log/memory';
import {resetSessionForTests} from '../src/storage/session';
import {resetLibraryForTests} from '../src/library/device';
import {closeLogFileForTests} from '../src/storage/logFile';
import {PluginManager} from 'sn-plugin-lib';
import type {SearchResult} from '../src/search-core/types';

const result: SearchResult = {
  id: 'openclipart:340609',
  source: 'openclipart',
  title: 'Ladle',
  thumbUrl: 'https://openclipart.org/image/400px/340609',
  license: 'CC0 1.0',
  attribution: 'Openclipart',
};
const image = {prepareForEink: jest.fn()};
const native = {
  downloadToFile: jest.fn(),
  writeText: jest.fn(),
  readText: jest.fn(),
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  NativeModules.Ink2PicFiles = native;
  NativeModules.Ink2PicImage = image;
  image.prepareForEink.mockResolvedValue({
    width: 640,
    height: 593,
    bytes: 40000,
  });
  resetSessionForTests();
  resetLibraryForTests();
  closeLogFileForTests();
  (PluginManager.getPluginDirPath as jest.Mock).mockResolvedValue(
    '/data/plugin',
  );
  native.readText.mockResolvedValue(null);
  native.writeText.mockResolvedValue(null);
  (FileUtils.getExternalDirPath as jest.Mock).mockResolvedValue([
    '/storage/emulated/0',
  ]);
  native.downloadToFile.mockResolvedValue(64109);
  (PluginNoteAPI.insertImage as jest.Mock).mockResolvedValue({
    success: true,
    result: true,
  });
});

describe('the early download of Insert picture (#88)', () => {
  const library =
    '/storage/emulated/0/MyStyle/Ink2Pic/library/openclipart-340609.png';

  it('prepares the early file and downloads nothing more when its picture wins', async () => {
    startLog();
    const early = startEarlyDownload(result);
    expect(
      await insertPicture(result, 'soup', null, false, undefined, early),
    ).toEqual({
      ok: true,
      value: library,
    });
    expect(native.downloadToFile).toHaveBeenCalledTimes(1);
    expect(native.downloadToFile.mock.calls[0][1]).toBe(
      '/data/plugin/insert-early.png',
    );
    expect(image.prepareForEink.mock.calls[0][0]).toBe(
      '/data/plugin/insert-early.png',
    );
    const text = logLines().join('\n');
    expect(text).toMatch(/time download: \d+ ms, early, started \d+ ms before/);
    for (const step of ['conversion', 'insert', 'lasso', 'write']) {
      expect(text).toMatch(new RegExp(`time ${step}: \\d+ ms`));
    }
  });

  it('downloads the winner itself when the early download was for another picture', async () => {
    const early = startEarlyDownload({...result, id: 'openclipart:1'});
    await early.raw;
    native.downloadToFile.mockClear();
    await insertPicture(result, 'soup', null, false, undefined, early);
    expect(native.downloadToFile.mock.calls[0][1]).toBe(
      '/data/plugin/insert-download.png',
    );
    expect(image.prepareForEink.mock.calls[0][0]).toBe(
      '/data/plugin/insert-download.png',
    );
  });

  it('downloads again when the early download failed', async () => {
    native.downloadToFile.mockRejectedValueOnce(
      Object.assign(new Error('HTTP 503'), {code: 'HTTP_503'}),
    );
    const early = startEarlyDownload(result);
    await insertPicture(result, 'soup', null, false, undefined, early);
    expect(native.downloadToFile).toHaveBeenCalledTimes(2);
    expect(native.downloadToFile.mock.calls[1][1]).toBe(
      '/data/plugin/insert-download.png',
    );
  });
});

describe('insertPicture (#12)', () => {
  it('downloads into the library and inserts the file', async () => {
    const path =
      '/storage/emulated/0/MyStyle/Ink2Pic/library/openclipart-340609.png';
    expect(await insertPicture(result, 'soup')).toEqual({
      ok: true,
      value: path,
    });
    // 800 px is what Openclipart serves: 640 px answers a redirect to it (#48).
    // The download goes to one temporary file in shared storage, which the note app can read
    // (brief section 6.6); the library keeps only the .png (#48).
    expect(native.downloadToFile.mock.calls[0].slice(0, 2)).toEqual([
      'https://openclipart.org/image/800px/340609',
      // Private: replacing a file in MyStyle needs FILE:DELETE (#62).
      '/data/plugin/insert-download.png',
    ]);
    expect(image.prepareForEink.mock.calls[0].slice(0, 5)).toEqual([
      '/data/plugin/insert-download.png',
      path,
      640,
      'png',
      false,
    ]);
    expect(PluginNoteAPI.insertImage).toHaveBeenCalledWith(path);
    const saved = native.writeText.mock.calls.find(
      call =>
        call[0] === '/storage/emulated/0/MyStyle/Ink2Pic/library/library.json',
    );
    expect(JSON.parse(saved[1]).items[0]).toMatchObject({
      id: 'openclipart:340609',
      query: 'soup',
      path,
    });
  });

  it('prepares a contour drawing when the tile showed one (#66)', async () => {
    expect((await insertPicture(result, 'soup', null, true)).ok).toBe(true);
    expect(image.prepareForEink.mock.calls[0][4]).toBe(true);
  });

  it('inserts a library picture without a download (#15)', async () => {
    const local = {
      ...result,
      id: 'library:openclipart:340609',
      localPath: '/s/a.png',
    };
    expect(await insertPicture(local, 'soup')).toEqual({
      ok: true,
      value: '/s/a.png',
    });
    expect(native.downloadToFile).not.toHaveBeenCalled();
  });

  it('stops at a failed download and does not insert', async () => {
    native.downloadToFile.mockRejectedValue(
      Object.assign(new Error('HTTP 503'), {code: 'HTTP_503'}),
    );
    expect((await insertPicture(result, 'soup')).ok).toBe(false);
    expect(PluginNoteAPI.insertImage).not.toHaveBeenCalled();
  });

  it('keeps the insertImage error', async () => {
    (PluginNoteAPI.insertImage as jest.Mock).mockResolvedValue({
      success: false,
      error: {code: 1501, message: 'no FILE:WRITE'},
    });
    expect(await insertPicture(result, 'soup')).toEqual({
      ok: false,
      code: 1501,
      message: 'no FILE:WRITE',
      step: 'place',
    });
  });

  it('takes the extension from the URL', () => {
    expect(
      imageExtension('https://upload.wikimedia.org/x/960px-Soup.JPG'),
    ).toBe('jpg');
    expect(imageExtension('https://openclipart.org/image/640px/1')).toBe('png');
  });

  it('uses the downloaded file when the e-ink preparation fails (#17)', async () => {
    image.prepareForEink.mockRejectedValue(
      Object.assign(new Error('bad'), {code: 'NOT_IMAGE'}),
    );
    const done = await insertPicture(result, 'soup');
    // Downloaded again into the library under its own name: the note app may not read the
    // private folder, and a file in MyStyle is never replaced (#62).
    const kept =
      '/storage/emulated/0/MyStyle/Ink2Pic/library/openclipart-340609.png';
    expect(done).toEqual({ok: true, value: kept});
    expect(native.downloadToFile.mock.calls.map(call => call[1])).toEqual([
      '/data/plugin/insert-download.png',
      kept,
    ]);
  });

  it('inserts a picture already in the library from disk (#48)', async () => {
    const path =
      '/storage/emulated/0/MyStyle/Ink2Pic/library/openclipart-340609.png';
    native.readText.mockImplementation(async (file: string) =>
      file.endsWith('/library.json')
        ? JSON.stringify({
            version: 1,
            recentSearches: [],
            items: [
              {
                id: 'openclipart:340609',
                source: 'openclipart',
                sourceId: '340609',
                sourceUrl: 'https://openclipart.org/image/800px/340609',
                query: 'ladle',
                license: 'CC0 1.0',
                attribution: 'Openclipart',
                savedAt: '2026-11-06T00:00:00.000Z',
                path,
                width: 640,
                height: 593,
              },
            ],
          })
        : null,
    );
    expect(await insertPicture(result, 'soup')).toEqual({
      ok: true,
      value: path,
    });
    expect(native.downloadToFile).not.toHaveBeenCalled();
    expect(image.prepareForEink).not.toHaveBeenCalled();
    expect(PluginNoteAPI.insertImage).toHaveBeenCalledWith(path);
  });

  it('places the picture at the lasso, else falls back to insertImage (#20)', async () => {
    const place = {
      rect: {left: 100, top: 200, right: 300, bottom: 260},
      page: 3,
      pageSize: {width: 1920, height: 2560},
    };
    (PluginCommAPI.createElement as jest.Mock).mockResolvedValue({
      success: true,
      result: {uuid: 'u'},
    });
    (PluginCommAPI.insertPageElements as jest.Mock).mockResolvedValue({
      success: true,
      result: true,
    });
    expect((await insertPicture(result, 'soup', place)).ok).toBe(true);
    const [elements, page, layer] = (
      PluginCommAPI.insertPageElements as jest.Mock
    ).mock.calls[0];
    expect([page, layer]).toEqual([3, 0]);
    expect(elements[0]).toMatchObject({
      type: 200,
      pageNum: 3,
      // Below the word, never over it (#39).
      picture: {rect: {left: 100, top: 284, right: 740, bottom: 877}},
    });
    expect(PluginNoteAPI.insertImage).not.toHaveBeenCalled();

    (PluginCommAPI.insertPageElements as jest.Mock).mockResolvedValue({
      success: false,
      error: {code: 107, message: 'bad element'},
    });
    expect((await insertPicture(result, 'soup', place)).ok).toBe(true);
    expect(PluginNoteAPI.insertImage).toHaveBeenCalled();
  });

  it('fails at place when insertImage answers false, and records nothing (#47)', async () => {
    (PluginNoteAPI.insertImage as jest.Mock).mockResolvedValue({
      success: true,
      result: false,
    });
    const done = await insertPicture(result, 'soup');
    expect(done).toMatchObject({ok: false, step: 'place'});
    const saved = native.writeText.mock.calls.find(call =>
      String(call[0]).endsWith('/library.json'),
    );
    expect(saved).toBeUndefined();
  });

  it('falls back to insertImage when the lasso leaves no visible band (#47)', async () => {
    const place = {
      rect: {left: 100, top: 40, right: 300, bottom: 2500},
      page: 1,
      pageSize: {width: 1920, height: 2560},
    };
    (PluginCommAPI.createElement as jest.Mock).mockResolvedValue({
      success: true,
      result: {uuid: 'u'},
    });
    (PluginCommAPI.insertPageElements as jest.Mock).mockResolvedValue({
      success: true,
      result: true,
    });
    expect((await insertPicture(result, 'soup', place)).ok).toBe(true);
    expect(PluginCommAPI.insertPageElements).not.toHaveBeenCalled();
    expect(PluginNoteAPI.insertImage).toHaveBeenCalled();
  });
});

describe('the inserted picture is left lassoed (#73)', () => {
  const place = {
    rect: {left: 100, top: 200, right: 300, bottom: 260},
    page: 3,
    pageSize: {width: 1920, height: 2560},
  };
  const placedRect = {left: 100, top: 284, right: 740, bottom: 877};
  const lasso = PluginCommAPI.lassoElements as jest.Mock;

  beforeEach(() => {
    (PluginCommAPI.createElement as jest.Mock).mockResolvedValue({
      success: true,
      result: {uuid: 'u'},
    });
    (PluginCommAPI.insertPageElements as jest.Mock).mockResolvedValue({
      success: true,
      result: true,
    });
    lasso.mockResolvedValue({success: true, result: true});
  });

  it('lassoes the placed rect, the picture alone, after the insert', async () => {
    expect((await insertPicture(result, 'soup', place)).ok).toBe(true);
    // The picture's rect, below the word: the handwriting is not selected (#39).
    expect(lasso).toHaveBeenCalledWith(placedRect);
    expect(lasso.mock.invocationCallOrder[0]).toBeGreaterThan(
      (PluginCommAPI.insertPageElements as jest.Mock).mock
        .invocationCallOrder[0],
    );
  });

  it('keeps the insert when the lasso fails, throws or answers false', async () => {
    lasso.mockResolvedValueOnce({
      success: false,
      error: {code: 904, message: 'no lasso context'},
    });
    expect((await insertPicture(result, 'soup', place)).ok).toBe(true);
    lasso.mockRejectedValueOnce(new Error('host gone'));
    expect((await insertPicture(result, 'soup', place)).ok).toBe(true);
    lasso.mockResolvedValueOnce({success: true, result: false});
    expect((await insertPicture(result, 'soup', place)).ok).toBe(true);
  });

  it('skips the lasso when the host placed the picture with insertImage', async () => {
    expect((await insertPicture(result, 'soup')).ok).toBe(true);
    expect(lasso).not.toHaveBeenCalled();
  });

  it('does not lasso a failed insert', async () => {
    (PluginCommAPI.insertPageElements as jest.Mock).mockResolvedValue({
      success: false,
      error: {code: 107, message: 'bad element'},
    });
    (PluginNoteAPI.insertImage as jest.Mock).mockResolvedValue({
      success: true,
      result: false,
    });
    expect((await insertPicture(result, 'soup', place)).ok).toBe(false);
    expect(lasso).not.toHaveBeenCalled();
  });
});

describe('the insert options from Settings (#70)', () => {
  const place = {
    rect: {left: 100, top: 200, right: 300, bottom: 260},
    page: 3,
    pageSize: {width: 1920, height: 2560},
  };
  const insertElements = PluginCommAPI.insertPageElements as jest.Mock;
  const remove = PluginCommAPI.deleteLassoElements as jest.Mock;
  const placedAt = () => insertElements.mock.calls[0][0][0].picture.rect;

  beforeEach(() => {
    (PluginCommAPI.createElement as jest.Mock).mockResolvedValue({
      success: true,
      result: {uuid: 'u'},
    });
    insertElements.mockResolvedValue({success: true, result: true});
    (PluginCommAPI.lassoElements as jest.Mock).mockResolvedValue({
      success: true,
      result: true,
    });
    remove.mockResolvedValue({success: true, result: true});
  });

  it('prepares the picture at the chosen width', async () => {
    await insertPicture(result, 'soup', place, false, {
      width: 960,
      placement: 'below',
      contour: false,
    });
    expect(image.prepareForEink.mock.calls[0][2]).toBe(960);
  });

  it('inserts every picture as a contour drawing under All contour', async () => {
    await insertPicture(result, 'soup', place, false, {
      width: 640,
      placement: 'below',
      contour: true,
    });
    expect(image.prepareForEink.mock.calls[0][4]).toBe(true);
  });

  it('shrinks a larger library picture to the chosen width', async () => {
    const local = {
      ...result,
      localPath: '/l.png',
      localSize: {width: 960, height: 900},
    };
    await insertPicture(local, 'soup', place, false, {
      width: 480,
      placement: 'below',
      contour: false,
    });
    const rect = placedAt();
    expect(rect.right - rect.left).toBe(480);
    expect(rect.bottom - rect.top).toBe(450);
  });

  it('deletes the word after the picture is placed at it, in place of the word', async () => {
    expect(
      (
        await insertPicture(result, 'soup', place, false, {
          width: 640,
          placement: 'replace',
          contour: false,
        })
      ).ok,
    ).toBe(true);
    expect(placedAt().top).toBe(200);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove.mock.invocationCallOrder[0]).toBeGreaterThan(
      insertElements.mock.invocationCallOrder[0],
    );
  });

  it('keeps the word when the insert fails or the picture is not at it', async () => {
    const options = {
      width: 640,
      placement: 'replace' as const,
      contour: false,
    };
    insertElements.mockResolvedValue({success: true, result: false});
    (PluginNoteAPI.insertImage as jest.Mock).mockResolvedValue({
      success: true,
      result: false,
    });
    expect(
      (await insertPicture(result, 'soup', place, false, options)).ok,
    ).toBe(false);
    // The host placed it with insertImage: not at the word.
    (PluginNoteAPI.insertImage as jest.Mock).mockResolvedValue({
      success: true,
      result: true,
    });
    expect(
      (await insertPicture(result, 'soup', place, false, options)).ok,
    ).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it('never deletes the word below or beside it', async () => {
    for (const placement of ['below', 'beside'] as const) {
      await insertPicture(result, 'soup', place, false, {
        width: 640,
        placement,
        contour: false,
      });
    }
    expect(remove).not.toHaveBeenCalled();
  });
});
