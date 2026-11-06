/** Jest mock of the SDK surface Ink2Pic wraps in src/sdk/; every call is a jest.fn(). */
export const PluginManager = {
  init: jest.fn(),
  registerButton: jest.fn(),
  registerButtonListener: jest.fn(() => ({remove: jest.fn()})),
  getDeviceType: jest.fn(),
  requestPermission: jest.fn(),
  hasPermission: jest.fn(),
  getPluginDirPath: jest.fn(),
  closePluginView: jest.fn(),
};

export const PluginCommAPI = {
  getLassoElements: jest.fn(),
  getLassoRect: jest.fn(),
  recognizeElements: jest.fn(),
  setLassoBoxState: jest.fn(),
  deleteLassoElements: jest.fn(),
  getCurrentFilePath: jest.fn(),
  getCurrentPageNum: jest.fn(),
};

export const PluginNoteAPI = {
  insertText: jest.fn(),
  insertImage: jest.fn(),
  saveCurrentNote: jest.fn(),
};

export const PluginFileAPI = {
  getPageSize: jest.fn(),
  insertElements: jest.fn(),
};

export const FileUtils = {
  exists: jest.fn(),
  makeDir: jest.fn(),
  listFiles: jest.fn(),
};
