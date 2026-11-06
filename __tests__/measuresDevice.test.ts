import {NativeModules} from 'react-native';
import {MODULE_CODE} from '../src/sdk/result';
import {deviceAnalyzer} from '../src/storage/measures';

const native = {measureThumb: jest.fn()};

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
