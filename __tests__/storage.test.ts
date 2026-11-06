import {NativeModules} from 'react-native';
import {MODULE_CODE} from '../src/sdk/result';
import {downloadToFile, readText, writeText} from '../src/storage/files';
import {libraryDir, safeFileName} from '../src/storage/paths';

const native = {
  downloadToFile: jest.fn(),
  writeText: jest.fn(),
  readText: jest.fn(),
};

beforeEach(() => {
  jest.resetAllMocks();
  NativeModules.Ink2PicFiles = native;
});

describe('files (#11)', () => {
  it('downloads with the User-Agent and returns the byte count', async () => {
    native.downloadToFile.mockResolvedValue(24197);
    expect(await downloadToFile('https://x.test/a.png', '/s/a.png')).toEqual({
      ok: true,
      value: 24197,
    });
    expect(native.downloadToFile.mock.calls[0][2]['User-Agent']).toMatch(
      /^Ink2Pic\//,
    );
  });

  it('keeps the module rejection code', async () => {
    native.downloadToFile.mockRejectedValue(
      Object.assign(new Error('HTTP 429 for https://x.test/'), {
        code: 'HTTP_429',
      }),
    );
    const result = await downloadToFile('https://x.test/', '/s/a');
    expect(result).toEqual({
      ok: false,
      code: MODULE_CODE,
      message: 'HTTP_429: HTTP 429 for https://x.test/',
      moduleCode: 'HTTP_429',
    });
  });

  it('reads a missing file as null and writes text', async () => {
    native.readText.mockResolvedValue(null);
    expect(await readText('/p/a.json')).toEqual({ok: true, value: null});
    native.writeText.mockResolvedValue(null);
    expect((await writeText('/p/a.json', '{}')).ok).toBe(true);
  });

  it('fails clearly when the module is not loaded', async () => {
    delete NativeModules.Ink2PicFiles;
    const result = await readText('/p/a.json');
    expect(result.ok === false && result.message).toMatch(
      /^MISSING: .*reactPackages/,
    );
  });
});

describe('paths (#11)', () => {
  it('builds the library folder under MyStyle', () => {
    expect(libraryDir('/storage/emulated/0/')).toBe(
      '/storage/emulated/0/MyStyle/Ink2Pic/library',
    );
  });

  it('makes file names safe', () => {
    expect(safeFileName('openclipart:340609 soup?.png')).toBe(
      'openclipart-340609-soup-.png',
    );
    expect(safeFileName('///')).toBe('file');
  });
});
