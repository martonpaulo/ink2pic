import {NativeModules} from 'react-native';
import {MODULE_CODE} from '../src/sdk/result';
import {deviceAnalyzer} from '../src/storage/measures';

const native = {measureThumb: jest.fn(), convertThumb: jest.fn()};

beforeEach(() => {
  jest.resetAllMocks();
  NativeModules.Ink2PicImage = native;
});

describe('deviceAnalyzer (#66)', () => {
  it('measures the file through the Java module', async () => {
    native.measureThumb.mockResolvedValue({mean: 240, ms: 3});
    expect(await deviceAnalyzer.measure('/p/thumbs/a.png')).toEqual({
      ok: true,
      value: {mean: 240, ms: 3},
    });
    expect(native.measureThumb).toHaveBeenCalledWith('/p/thumbs/a.png');
  });

  it('writes a contour drawing on the thumbnail lane, with the measures of its pixels (#101)', async () => {
    const converted = {width: 330, height: 400, ms: 9, measures: {mean: 250, ms: 2}};
    native.convertThumb.mockResolvedValue(converted);
    expect(
      await deviceAnalyzer.toContour('/p/a', '/p/a.contour.png', 400),
    ).toEqual({ok: true, value: converted});
    expect(native.convertThumb).toHaveBeenCalledWith(
      '/p/a',
      '/p/a.contour.png',
      400,
      true,
    );
  });

  it('darkens faint lines on the thumbnail lane, without a contour (#81, #101)', async () => {
    native.convertThumb.mockResolvedValue({width: 330, height: 400, ms: 4, measures: {}});
    await deviceAnalyzer.darken?.('/p/a', '/p/a.dark.png', 400);
    expect(native.convertThumb).toHaveBeenCalledWith(
      '/p/a',
      '/p/a.dark.png',
      400,
      false,
    );
  });

  it('keeps the module rejection code', async () => {
    native.measureThumb.mockRejectedValue(
      Object.assign(new Error('cannot decode /p/a'), {code: 'NOT_IMAGE'}),
    );
    expect(await deviceAnalyzer.measure('/p/a')).toEqual({
      ok: false,
      code: MODULE_CODE,
      message: 'NOT_IMAGE: cannot decode /p/a',
      moduleCode: 'NOT_IMAGE',
    });
  });
});
