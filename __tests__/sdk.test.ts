import {
  PluginCommAPI,
  PluginFileAPI,
  PluginManager,
  PluginNoteAPI,
} from 'sn-plugin-lib';
import * as lasso from '../src/sdk/lasso';
import * as note from '../src/sdk/note';
import * as page from '../src/sdk/page';
import * as plugin from '../src/sdk/plugin';
import {THROWN_CODE} from '../src/sdk/result';

const sdkFailure = {success: false, error: {code: 904, message: 'no lasso'}};
const success = (result: unknown) => ({success: true, result});
const mocked = (fn: unknown) => fn as jest.Mock;

beforeEach(() => jest.resetAllMocks());

/** Wrappers over calls that answer with the SDK's {success, result, error} shape. */
const responseCalls: [string, jest.Mock, () => Promise<unknown>, unknown][] = [
  [
    'getLassoElements',
    mocked(PluginCommAPI.getLassoElements),
    () => lasso.getLassoElements(),
    [],
  ],
  [
    'getLassoRect',
    mocked(PluginCommAPI.getLassoRect),
    () => lasso.getLassoRect(),
    {left: 1},
  ],
  [
    'recognizeElements',
    mocked(PluginCommAPI.recognizeElements),
    () => lasso.recognizeElements([], {width: 1, height: 1}),
    'soup',
  ],
  [
    'insertImage',
    mocked(PluginNoteAPI.insertImage),
    () => note.insertImage('/a.png'),
    true,
  ],
  [
    'getCurrentFilePath',
    mocked(PluginCommAPI.getCurrentFilePath),
    () => page.getCurrentFilePath(),
    '/Note/a.note',
  ],
  [
    'getCurrentPageNum',
    mocked(PluginCommAPI.getCurrentPageNum),
    () => page.getCurrentPageNum(),
    0,
  ],
  [
    'getPageSize',
    mocked(PluginFileAPI.getPageSize),
    () => page.getPageSize('/Note/a.note', 0),
    {width: 1920, height: 2560},
  ],
];

describe.each(responseCalls)('%s', (_name, sdkCall, wrapper, value) => {
  it('returns the value on success', async () => {
    sdkCall.mockResolvedValue(success(value));
    expect(await wrapper()).toEqual({ok: true, value});
  });

  it('keeps the SDK error code', async () => {
    sdkCall.mockResolvedValue(sdkFailure);
    expect(await wrapper()).toEqual({
      ok: false,
      code: 904,
      message: 'no lasso',
    });
  });

  it('turns a thrown error into a failure', async () => {
    sdkCall.mockRejectedValue(new Error('bridge down'));
    expect(await wrapper()).toEqual({
      ok: false,
      code: THROWN_CODE,
      message: 'bridge down',
    });
  });
});

describe('plain-value calls', () => {
  it('reads permissions as granted or not', async () => {
    mocked(PluginManager.hasPermission).mockResolvedValue(1);
    expect(await plugin.hasPermission(plugin.PERMISSION_INTERNET)).toEqual({
      ok: true,
      value: true,
    });
    mocked(PluginManager.hasPermission).mockResolvedValue(0);
    expect(await plugin.hasPermission(plugin.PERMISSION_INTERNET)).toEqual({
      ok: true,
      value: false,
    });
  });

  it('reads the always-allowed answer 2 as granted (#34)', async () => {
    mocked(PluginManager.hasPermission).mockResolvedValue(2);
    expect(await plugin.hasPermission(plugin.PERMISSION_INTERNET)).toEqual({
      ok: true,
      value: true,
    });
  });

  it('passes the permission answer through', async () => {
    mocked(PluginManager.requestPermission).mockResolvedValue(2);
    expect(
      await plugin.requestPermission(plugin.PERMISSION_FILE_WRITE),
    ).toEqual({
      ok: true,
      value: 2,
    });
  });

  it('fails when the plugin directory is missing', async () => {
    mocked(PluginManager.getPluginDirPath).mockResolvedValue(null);
    expect((await plugin.getPluginDirPath()).ok).toBe(false);
    mocked(PluginManager.getPluginDirPath).mockResolvedValue('/data/plugins/x');
    expect(await plugin.getPluginDirPath()).toEqual({
      ok: true,
      value: '/data/plugins/x',
    });
  });

  it('reports a view that cannot close', async () => {
    mocked(PluginManager.closePluginView).mockRejectedValue(
      new Error('no view'),
    );
    expect((await plugin.closePluginView()).ok).toBe(false);
  });
});

describe('numeric answers (#23)', () => {
  it('fails instead of reporting NaN when the host answers nothing', async () => {
    mocked(PluginManager.requestPermission).mockResolvedValue(undefined);
    expect(
      (await plugin.requestPermission(plugin.PERMISSION_INTERNET)).ok,
    ).toBe(false);
    mocked(PluginManager.hasPermission).mockResolvedValue(null);
    expect((await plugin.hasPermission(plugin.PERMISSION_INTERNET)).ok).toBe(
      false,
    );
  });
});
