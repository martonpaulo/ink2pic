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
    'showPluginView',
    'registerConfigButton',
  ),
  registerButtonListener: jest.fn(() => ({remove: jest.fn()})),
  registerConfigButtonListener: jest.fn(() => ({remove: jest.fn()})),
  registerLangListener: jest.fn(() => ({remove: jest.fn()})),
  registerPluginLifeListener: jest.fn(() => ({remove: jest.fn()})),
  registerEventListener: jest.fn(() => ({remove: jest.fn()})),
  registerMotionListener: jest.fn(() => ({remove: jest.fn()})),
};

export const PluginCommAPI = mocks(
  'getLassoElements',
  'getLassoRect',
  'lassoElements',
  'recognizeElements',
  'setLassoBoxState',
  'deleteLassoElements',
  'getCurrentFilePath',
  'getCurrentPageNum',
  'createElement',
  'insertPageElements',
  'getPenInfo',
);

export const PluginNoteAPI = mocks(
  'insertText',
  'insertImage',
  'saveCurrentNote',
);

export const PluginFileAPI = mocks(
  'getPageSize',
  'insertElements',
  'getLastElement',
  'getElements',
);

export const FileUtils = mocks(
  'exists',
  'makeDir',
  'listFiles',
  'getExternalDirPath',
);
