import {NativeModules} from 'react-native';
import {FileUtils, PluginNoteAPI} from 'sn-plugin-lib';
import {imageExtension, insertPicture} from '../src/flow/insertPicture';
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
const native = {
  downloadToFile: jest.fn(),
  writeText: jest.fn(),
  readText: jest.fn(),
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  NativeModules.Ink2PicFiles = native;
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
    expect(await insertPicture(result)).toEqual({ok: true, value: path});
    expect(native.downloadToFile.mock.calls[0].slice(0, 2)).toEqual([
      'https://openclipart.org/image/640px/340609',
      path,
    ]);
    expect(PluginNoteAPI.insertImage).toHaveBeenCalledWith(path);
  });

  it('stops at a failed download and does not insert', async () => {
    native.downloadToFile.mockRejectedValue(
      Object.assign(new Error('HTTP 503'), {code: 'HTTP_503'}),
    );
    expect((await insertPicture(result)).ok).toBe(false);
    expect(PluginNoteAPI.insertImage).not.toHaveBeenCalled();
  });

  it('keeps the insertImage error', async () => {
    (PluginNoteAPI.insertImage as jest.Mock).mockResolvedValue({
      success: false,
      error: {code: 1501, message: 'no FILE:WRITE'},
    });
    expect(await insertPicture(result)).toEqual({
      ok: false,
      code: 1501,
      message: 'no FILE:WRITE',
    });
  });

  it('takes the extension from the URL', () => {
    expect(
      imageExtension('https://upload.wikimedia.org/x/960px-Soup.JPG'),
    ).toBe('jpg');
    expect(imageExtension('https://openclipart.org/image/640px/1')).toBe('png');
  });
});
