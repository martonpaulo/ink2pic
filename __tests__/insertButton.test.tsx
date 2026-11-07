/** The «Insert best picture» lasso button (#74): registered first, and no grid on its press. */
import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {
  FileUtils,
  PluginCommAPI,
  PluginFileAPI,
  PluginManager,
} from 'sn-plugin-lib';
import App from '../App';
import {
  BUTTON_TYPE_LASSO,
  EDIT_DATA_STROKES,
  INSERT_BUTTON_ID,
  LASSO_BUTTON_ID,
  SHOW_FULL_VIEW,
  SHOW_NO_VIEW,
} from '../src/buttons';
import {
  HeadlessDeps,
  insertWithoutView,
  takeHeadlessNote,
} from '../src/flow/headlessInsert';
import {takePendingButton} from '../src/sdk/buttons';
import {insertBest} from '../src/flow/quickInsert';
import {startButtonQueue} from '../src/sdk/buttons';
import {copy} from '../src/ui/copy';
import {SearchScreen} from '../src/ui/SearchScreen';
import {compilePlugin} from './host/journey';

// The startup test loads index.js afresh; its first compile happens here, outside the test (#107).
compilePlugin();

jest.mock('../src/flow/quickInsert', () => ({insertBest: jest.fn()}));
// The grid's own search is not these tests': it never answers, so nothing logs after a test.
jest.mock('../src/flow/search', () => ({
  ...jest.requireActual('../src/flow/search'),
  runSearch: jest.fn(() => new Promise(() => {})),
}));

const ok = (result: unknown) => Promise.resolve({success: true, result});
const lassoRect = {left: 100, top: 200, right: 300, bottom: 260};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  global.fetch = jest.fn().mockRejectedValue(new Error('offline in tests'));
  (PluginManager.hasPermission as jest.Mock).mockResolvedValue(1);
  (PluginManager.getPluginDirPath as jest.Mock).mockResolvedValue('/p');
  (PluginManager.closePluginView as jest.Mock).mockResolvedValue(true);
  (FileUtils.getExternalDirPath as jest.Mock).mockResolvedValue(['/s']);
  (PluginCommAPI.getLassoElements as jest.Mock).mockReturnValue(
    ok([{type: 0}]),
  );
  (PluginCommAPI.getLassoRect as jest.Mock).mockReturnValue(ok(lassoRect));
  (PluginCommAPI.getCurrentFilePath as jest.Mock).mockReturnValue(
    ok('/n.note'),
  );
  (PluginCommAPI.getCurrentPageNum as jest.Mock).mockReturnValue(ok(3));
  (PluginFileAPI.getPageSize as jest.Mock).mockReturnValue(
    ok({width: 1920, height: 2560}),
  );
  (PluginCommAPI.recognizeElements as jest.Mock).mockReturnValue(ok('soup'));
});

/** The view opened by a press of `id` that came before it mounted. */
async function openedBy(id: number) {
  startButtonQueue();
  const calls = (PluginManager.registerButtonListener as jest.Mock).mock.calls;
  calls[calls.length - 1][0].onButtonPress({id});
  return mounted();
}

/** The view, mounted, once its opening settled. */
async function mounted() {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<App />);
  });
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise(resolve => setImmediate(resolve));
    });
  }
  return tree;
}

const text = (tree: renderer.ReactTestRenderer) =>
  JSON.stringify(tree.toJSON());

describe('Insert best picture (#74)', () => {
  it('inserts the best picture for the lassoed word at the lasso, then closes, with no grid', async () => {
    (insertBest as jest.Mock).mockResolvedValue({ok: true, value: '/s/a.png'});
    const tree = await openedBy(INSERT_BUTTON_ID);
    expect(insertBest).toHaveBeenCalledWith(
      'soup',
      {rect: lassoRect, page: 3, pageSize: {width: 1920, height: 2560}},
      undefined,
      {stop: expect.any(Function)},
    );
    expect(PluginManager.closePluginView).toHaveBeenCalledTimes(1);
    expect(tree.root.findAllByType(SearchScreen)).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('opens the search screen with the sentence and stays open when the insert fails (#96)', async () => {
    (insertBest as jest.Mock).mockResolvedValue({
      ok: false,
      text: copy['error.place'],
    });
    const tree = await openedBy(INSERT_BUTTON_ID);
    expect(text(tree)).toContain(copy['error.place']);
    expect(PluginManager.closePluginView).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('a Close while the insert runs stops it before the note is written (#96)', async () => {
    let stop: (() => string | null) | undefined;
    (insertBest as jest.Mock).mockImplementation(
      async (_w: string, _p: unknown, _d: unknown, limit: {stop: () => string | null}) => {
        stop = limit.stop;
        return new Promise(() => {});
      },
    );
    const tree = await openedBy(INSERT_BUTTON_ID);
    expect(stop?.()).toBeNull();
    const calls = (PluginManager.registerPluginLifeListener as jest.Mock).mock
      .calls;
    // Lifecycle 3: the person closed the view.
    await act(async () => calls[calls.length - 1][0].onMsg({state: 3}));
    expect(stop?.()).toBe('the view closed');
    act(() => tree.unmount());
  });

  it('says to type the word when the handwriting is not recognized, and inserts nothing', async () => {
    (PluginCommAPI.recognizeElements as jest.Mock).mockReturnValue(ok(' '));
    const tree = await openedBy(INSERT_BUTTON_ID);
    expect(insertBest).not.toHaveBeenCalled();
    expect(text(tree)).toContain(copy['error.recognition']);
    act(() => tree.unmount());
  });

  it('keeps Choose picture on the grid', async () => {
    const tree = await openedBy(LASSO_BUTTON_ID);
    expect(insertBest).not.toHaveBeenCalled();
    expect(tree.root.findByProps({testID: 'query'}).props.value).toBe('soup');
    act(() => tree.unmount());
  });
});

it('registers Insert best picture before Choose picture, both for handwriting only (#74)', () => {
  // index.js in its own module registry, with that registry's SDK mock.
  let register!: jest.Mock;
  jest.isolateModules(() => {
    register = require('sn-plugin-lib').PluginManager.registerButton;
    register.mockResolvedValue(true);
    require('sn-plugin-lib').PluginManager.registerConfigButton.mockResolvedValue(
      true,
    );
    require('../index');
  });
  const lassoButtons = register.mock.calls
    .filter(([type]) => type === BUTTON_TYPE_LASSO)
    .map(([, apps, button]) => ({apps, ...button}));
  expect(lassoButtons.map(button => [button.id, button.name])).toEqual([
    [INSERT_BUTTON_ID, copy['button.insert']],
    [LASSO_BUTTON_ID, copy['button.lasso']],
  ]);
  for (const button of lassoButtons) {
    expect(button.apps).toEqual(['NOTE']);
    expect(button.editDataTypes).toEqual([EDIT_DATA_STROKES]);
  }
  // Insert best picture stays on the note; Choose picture keeps its view (#74).
  expect(lassoButtons.map(button => button.showType)).toEqual([
    SHOW_NO_VIEW,
    SHOW_FULL_VIEW,
  ]);
});

describe('Insert best picture with no view (#74)', () => {
  const place = {
    rect: lassoRect,
    page: 3,
    pageSize: {width: 1920, height: 2560},
  };
  const headless = (more: Partial<HeadlessDeps> = {}): HeadlessDeps => ({
    session: jest.fn().mockResolvedValue(undefined),
    folder: jest.fn().mockResolvedValue({ok: true, value: '/p'}),
    missing: jest.fn().mockResolvedValue([]),
    read: jest
      .fn()
      .mockResolvedValue({ok: true, value: {query: 'soup', place}}),
    insert: jest.fn().mockResolvedValue({ok: true, value: '/s/a.png'}),
    show: jest.fn().mockResolvedValue({ok: true, value: true}),
    press: jest.fn(),
    ...more,
  });

  beforeEach(() => {
    takeHeadlessNote();
    takePendingButton();
  });

  it('runs the press in the button listener and never queues it for the view', () => {
    let listener!: (event: {id: number}) => void;
    let run!: jest.Mock;
    jest.isolateModules(() => {
      const sdk = require('sn-plugin-lib');
      sdk.PluginManager.registerButton.mockResolvedValue(true);
      sdk.PluginManager.registerConfigButton.mockResolvedValue(true);
      jest.doMock('../src/flow/headlessInsert', () => ({
        insertWithoutView: jest.fn().mockResolvedValue(undefined),
      }));
      run = require('../src/flow/headlessInsert').insertWithoutView;
      require('../index');
      const calls = sdk.PluginManager.registerButtonListener.mock.calls;
      listener = calls[calls.length - 1][0].onButtonPress;
      listener({id: INSERT_BUTTON_ID});
      expect(require('../src/sdk/buttons').takePendingButton()).toBeNull();
      listener({id: LASSO_BUTTON_ID});
      expect(require('../src/sdk/buttons').takePendingButton()).toBe(
        LASSO_BUTTON_ID,
      );
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('inserts the lassoed word and opens no view', async () => {
    const deps = headless();
    await insertWithoutView(deps);
    expect(deps.insert).toHaveBeenCalledWith(
      'soup',
      {...place, recheck: true},
      undefined,
      {deadline: expect.any(Number)},
    );
    expect(deps.show).not.toHaveBeenCalled();
    expect(takeHeadlessNote()).toBeNull();
  });

  it('opens the search screen with the word and the failure sentence when the insert fails', async () => {
    const deps = headless({
      insert: jest
        .fn()
        .mockResolvedValue({ok: false, text: copy['error.place']}),
    });
    await insertWithoutView(deps);
    expect(deps.show).toHaveBeenCalledTimes(1);
    // The view, once open, shows that sentence and inserts nothing more.
    const tree = await mounted();
    expect(text(tree)).toContain(copy['error.place']);
    expect(insertBest).not.toHaveBeenCalled();
    // The search screen, with the word, as Choose picture opens it (#96).
    expect(tree.root.findByProps({testID: 'query'}).props.value).toBe('soup');
    act(() => tree.unmount());
  });

  it('opens the view with the recognition sentence when the word is not read', async () => {
    const deps = headless({
      read: jest
        .fn()
        .mockResolvedValue({ok: false, code: 104, message: 'empty'}),
    });
    await insertWithoutView(deps);
    expect(deps.insert).not.toHaveBeenCalled();
    expect(deps.show).toHaveBeenCalledTimes(1);
    expect(takeHeadlessNote()).toEqual({
      query: '',
      place: null,
      lassoFailure: expect.objectContaining({step: 'lasso'}),
      text: expect.any(String),
    });
  });

  it('hands the press to the view for its onboarding when a permission is missing', async () => {
    const deps = headless({
      missing: jest.fn().mockResolvedValue([{permission: 'x', reason: 'y'}]),
    });
    await insertWithoutView(deps);
    expect(deps.press).toHaveBeenCalledWith(INSERT_BUTTON_ID);
    expect(deps.show).toHaveBeenCalledTimes(1);
    expect(deps.read).not.toHaveBeenCalled();
  });
});
