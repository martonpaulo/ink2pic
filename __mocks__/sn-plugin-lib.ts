/** Jest mock of the SDK surface Ink2Pic wraps in src/sdk/; every call is a jest.fn(). */
const mocks = (...names: string[]): Record<string, jest.Mock> =>
  Object.fromEntries(names.map(name => [name, jest.fn()]));

export const PluginManager = {
  ...mocks(
    'init',
    'registerButton',
    'getDeviceType',
    'requestPermission',
    'hasPermission',
    'getPluginDirPath',
    'closePluginView',
  ),
  registerButtonListener: jest.fn(() => ({remove: jest.fn()})),
};

export const PluginCommAPI = mocks(
  'getLassoElements',
  'getLassoRect',
  'recognizeElements',
  'setLassoBoxState',
  'deleteLassoElements',
  'getCurrentFilePath',
  'getCurrentPageNum',
);

export const PluginNoteAPI = mocks('insertText', 'insertImage', 'saveCurrentNote');

export const PluginFileAPI = mocks('getPageSize', 'insertElements');

export const FileUtils = mocks('exists', 'makeDir', 'listFiles', 'getExternalDirPath');
