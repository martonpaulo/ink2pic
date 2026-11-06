import {NativeModules} from 'react-native';
import {FileUtils, PluginCommAPI, PluginNoteAPI} from 'sn-plugin-lib';
import {imageExtension, insertPicture} from '../src/flow/insertPicture';
import {resetSessionForTests} from '../src/flow/session';
import {resetLibraryForTests} from '../src/library/device';
import {closeLogFileForTests} from '../src/log/file';
import {PluginManager} from 'sn-plugin-lib';
import type {SearchResult} from '../src/sources/types';

const result: SearchResult = {
  id: 'openclipart:340609',
  source: 'openclipart',
  title: 'Ladle',
  thumbUrl: 'https://openclipart.org/image/400px/340609',
  fullUrl: w => `https://openclipart.org/image/${w}px/340609`,
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

describe('insertPicture (#12)', () => {
  it('downloads into the library and inserts the file', async () => {
    const path =
      '/storage/emulated/0/MyStyle/Ink2Pic/library/openclipart-340609.png';
    expect(await insertPicture(result, 'soup')).toEqual({
      ok: true,
      value: path,
    });
    // 800 px is what Openclipart serves: 640 px answers a redirect to it (#48).
    // The download goes to one private temporary file; the library keeps only the .png (#48).
    expect(native.downloadToFile.mock.calls[0].slice(0, 2)).toEqual([
      'https://openclipart.org/image/800px/340609',
      '/data/plugin/insert-download.png',
    ]);
    expect(image.prepareForEink.mock.calls[0].slice(0, 3)).toEqual([
      '/data/plugin/insert-download.png',
      path,
      640,
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
    expect(done).toEqual({ok: true, value: '/data/plugin/insert-download.png'});
    // The temporary file is overwritten by the next insert: it is never a library picture (#48).
    const saved = native.writeText.mock.calls.find(call =>
      String(call[0]).endsWith('/library.json'),
    );
    expect(saved).toBeUndefined();
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
