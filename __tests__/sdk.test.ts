import {
  FileUtils,
  PluginCommAPI,
  PluginFileAPI,
  PluginManager,
  PluginNoteAPI,
} from 'sn-plugin-lib';
import * as files from '../src/sdk/files';
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
    'setLassoBoxState',
    mocked(PluginCommAPI.setLassoBoxState),
    () => lasso.setLassoBoxState(lasso.LassoBox.remove),
    true,
  ],
  [
    'deleteLassoElements',
    mocked(PluginCommAPI.deleteLassoElements),
    () => lasso.deleteLassoElements(),
    true,
  ],
  [
    'insertText',
    mocked(PluginNoteAPI.insertText),
    () =>
      note.insertText({
        text: 'a',
        rect: {left: 0, top: 0, right: 1, bottom: 1},
        fontSize: 1,
      }),
    true,
  ],
  [
    'insertImage',
    mocked(PluginNoteAPI.insertImage),
    () => note.insertImage('/a.png'),
    true,
  ],
  [
    'saveCurrentNote',
    mocked(PluginNoteAPI.saveCurrentNote),
    () => note.saveCurrentNote(),
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
  [
    'insertElements',
    mocked(PluginFileAPI.insertElements),
    () => page.insertElements('/Note/a.note', 0, []),
    true,
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

  it('reads the device type and closes the view', async () => {
    mocked(PluginManager.getDeviceType).mockResolvedValue(5);
    expect(await plugin.getDeviceType()).toEqual({ok: true, value: 5});
    mocked(PluginManager.closePluginView).mockRejectedValue(
      new Error('no view'),
    );
    expect((await plugin.closePluginView()).ok).toBe(false);
  });

  it('wraps the file utilities', async () => {
    mocked(FileUtils.exists).mockResolvedValue(true);
    expect(await files.exists('/a')).toEqual({ok: true, value: true});
    mocked(FileUtils.makeDir).mockRejectedValue(new Error('1501'));
    expect(await files.makeDir('/a')).toEqual({
      ok: false,
      code: THROWN_CODE,
      message: '1501',
    });
    mocked(FileUtils.listFiles).mockResolvedValue(undefined);
    expect((await files.listFiles('/a')).ok).toBe(false);
    mocked(FileUtils.listFiles).mockResolvedValue(['/a/b.png']);
    expect(await files.listFiles('/a')).toEqual({
      ok: true,
      value: ['/a/b.png'],
    });
  });

  it('stops listening to buttons', () => {
    const remove = jest.fn();
    mocked(PluginManager.registerButtonListener).mockReturnValue({remove});
    const stop = plugin.onButtonPress(() => {});
    stop();
    expect(remove).toHaveBeenCalled();
  });
});

describe('numeric answers (#23)', () => {
  it('fails instead of reporting NaN when the host answers nothing', async () => {
    mocked(PluginManager.getDeviceType).mockResolvedValue(undefined);
    expect((await plugin.getDeviceType()).ok).toBe(false);
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
