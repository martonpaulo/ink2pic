/** The «Insert picture» lasso button (#74): registered first, and no grid on its press. */
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
} from '../src/buttons';
import {insertBest} from '../src/flow/quickInsert';
import {startButtonQueue} from '../src/sdk/buttons';
import {copy} from '../src/ui/copy';
import {SearchScreen} from '../src/ui/SearchScreen';

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

const text = (tree: renderer.ReactTestRenderer) => JSON.stringify(tree.toJSON());

describe('Insert picture (#74)', () => {
  it('inserts the best picture for the lassoed word at the lasso, then closes, with no grid', async () => {
    (insertBest as jest.Mock).mockResolvedValue({ok: true, value: '/s/a.png'});
    const tree = await openedBy(INSERT_BUTTON_ID);
    expect(insertBest).toHaveBeenCalledWith('soup', {
      rect: lassoRect,
      page: 3,
      pageSize: {width: 1920, height: 2560},
    });
    expect(PluginManager.closePluginView).toHaveBeenCalledTimes(1);
    expect(tree.root.findAllByType(SearchScreen)).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('shows the sentence and stays open when the insert fails', async () => {
    (insertBest as jest.Mock).mockResolvedValue({
      ok: false,
      text: copy['error.place'],
    });
    const tree = await openedBy(INSERT_BUTTON_ID);
    expect(text(tree)).toContain(copy['error.place']);
    expect(PluginManager.closePluginView).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('says to type the word when the handwriting is not recognized, and inserts nothing', async () => {
    (PluginCommAPI.recognizeElements as jest.Mock).mockReturnValue(ok(' '));
    const tree = await openedBy(INSERT_BUTTON_ID);
    expect(insertBest).not.toHaveBeenCalled();
    expect(text(tree)).toContain(copy['error.recognition']);
    act(() => tree.unmount());
  });

  it('keeps Find picture on the grid', async () => {
    const tree = await openedBy(LASSO_BUTTON_ID);
    expect(insertBest).not.toHaveBeenCalled();
    expect(tree.root.findByProps({testID: 'query'}).props.value).toBe('soup');
    act(() => tree.unmount());
  });
});

it('registers Insert picture before Find picture, both for handwriting only (#74)', () => {
  // index.js in its own module registry, with that registry's SDK mock.
  let register!: jest.Mock;
  jest.isolateModules(() => {
    register = require('sn-plugin-lib').PluginManager.registerButton;
    register.mockResolvedValue(true);
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
});
