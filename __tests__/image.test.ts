import {NativeModules} from 'react-native';
import {MODULE_CODE} from '../src/sdk/result';
import {prepareForEink} from '../src/storage/image';

const native = {prepareForEink: jest.fn()};

beforeEach(() => {
  jest.resetAllMocks();
  NativeModules.Ink2PicImage = native;
});

describe('prepareForEink (#17)', () => {
  it('passes the paths, the width and PNG by default, and returns the written size', async () => {
    const written = {width: 640, height: 360, bytes: 48213};
    native.prepareForEink.mockResolvedValue(written);
    expect(await prepareForEink('/s/a.download', '/s/a.png', 640)).toEqual({
      ok: true,
      value: written,
    });
    expect(native.prepareForEink).toHaveBeenCalledWith(
      '/s/a.download',
      '/s/a.png',
      640,
      'png',
    );
  });

  it('keeps the module rejection code', async () => {
    native.prepareForEink.mockRejectedValue(
      Object.assign(new Error('cannot decode /s/a'), {code: 'NOT_IMAGE'}),
    );
    expect(await prepareForEink('/s/a', '/s/b.jpg', 640, 'jpg')).toEqual({
      ok: false,
      code: MODULE_CODE,
      message: 'NOT_IMAGE: cannot decode /s/a',
      moduleCode: 'NOT_IMAGE',
    });
  });

  it('fails clearly when the module is not loaded', async () => {
    delete NativeModules.Ink2PicImage;
    const result = await prepareForEink('/s/a', '/s/b.png', 640);
    expect(result.ok === false && result.message).toMatch(
      /^MISSING: Ink2PicImage .*reactPackages/,
    );
    expect(result.ok === false && result.moduleCode).toBe('MISSING');
  });
});
