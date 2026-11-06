/** The view opens without the button event and without a timer (#13, build 0.1.0 (8)). */
import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {
  FileUtils,
  PluginCommAPI,
  PluginFileAPI,
  PluginManager,
} from 'sn-plugin-lib';
import App from '../App';
import {logLines} from '../src/log/memory';
import {startButtonQueue} from '../src/sdk/buttons';

const ok = (result: unknown) => Promise.resolve({success: true, result});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  global.fetch = jest.fn().mockRejectedValue(new Error('offline in tests'));
  (PluginManager.hasPermission as jest.Mock).mockResolvedValue(1);
  (PluginManager.getPluginDirPath as jest.Mock).mockResolvedValue('/p');
  (FileUtils.getExternalDirPath as jest.Mock).mockResolvedValue(['/s']);
  (PluginCommAPI.getCurrentFilePath as jest.Mock).mockReturnValue(
    ok('/n.note'),
  );
  (PluginCommAPI.getCurrentPageNum as jest.Mock).mockReturnValue(ok(0));
  (PluginCommAPI.getLassoRect as jest.Mock).mockReturnValue(
    ok({left: 1, top: 2, right: 3, bottom: 4}),
  );
  (PluginFileAPI.getPageSize as jest.Mock).mockReturnValue(
    ok({width: 1920, height: 2560}),
  );
  (PluginCommAPI.recognizeElements as jest.Mock).mockReturnValue(ok('soup'));
});

async function mount() {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<App />);
  });
  // Let the search, the library load and the log writes settle before the test checks.
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise(resolve => setImmediate(resolve));
    });
  }
  return tree;
}

it('opens the lasso flow when a lasso is active, with no button event', async () => {
  (PluginCommAPI.getLassoElements as jest.Mock).mockReturnValue(
    ok([{type: 700}]),
  );
  const tree = await mount();
  expect(logLines().join('\n')).toContain('button 200 (decided on open)');
  expect(tree.root.findByProps({testID: 'query'}).props.value).toBe('soup');
  act(() => tree.unmount());
});

it('opens an empty search when no lasso is active', async () => {
  (PluginCommAPI.getLassoElements as jest.Mock).mockReturnValue(ok([]));
  const tree = await mount();
  expect(logLines().join('\n')).toContain('button 100 (decided on open)');
  expect(tree.root.findByProps({testID: 'query'}).props.value).toBe('');
  act(() => tree.unmount());
});

it('takes a later press as a new opening, even with no lifecycle 3 (#34)', async () => {
  (PluginCommAPI.getLassoElements as jest.Mock).mockReturnValue(
    ok([{type: 700}]),
  );
  startButtonQueue();
  const press = (PluginManager.registerButtonListener as jest.Mock).mock
    .calls[0][0].onButtonPress;
  const now = jest.spyOn(Date, 'now');
  now.mockReturnValue(1_000_000);
  const tree = await mount();
  // The host's replay of the opening press: a duplicate.
  await act(async () => press({id: 200}));
  expect(logLines().join('\n')).toContain('button 200 (live) already handled');
  // Minutes later, after a silent hide, the person lassoes a new word.
  now.mockReturnValue(1_000_000 + 60_000);
  (PluginCommAPI.recognizeElements as jest.Mock).mockReturnValue(ok('apple'));
  await act(async () => press({id: 200}));
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise(resolve => setImmediate(resolve));
    });
  }
  expect(tree.root.findByProps({testID: 'query'}).props.value).toBe('apple');
  act(() => tree.unmount());
});
