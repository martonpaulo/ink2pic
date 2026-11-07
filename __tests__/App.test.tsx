/** The view opens without the button event and without a timer (#13, build 0.1.0 (8)). */
import React from 'react';
import {NativeModules} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {
  FileUtils,
  PluginCommAPI,
  PluginFileAPI,
  PluginManager,
} from 'sn-plugin-lib';
import App from '../App';
import {insertPicture} from '../src/flow/insertPicture';
import {resetSessionForTests} from '../src/storage/session';
import {logLines, setAfterCall} from '../src/log/memory';
import {
  closeLogFileForTests,
  flushLogFile,
  openLogFile,
} from '../src/storage/logFile';
import {startButtonQueue} from '../src/sdk/buttons';
import {copy} from '../src/ui/copy';
import {SearchScreen} from '../src/ui/SearchScreen';

jest.mock('../src/flow/insertPicture', () => ({
  ...jest.requireActual('../src/flow/insertPicture'),
  insertPicture: jest.fn(),
}));

const ok = (result: unknown) => Promise.resolve({success: true, result});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  // Every source answers at once with an error that is not retried: an offline fetch is tried
  // again after 400 ms, so its search would log after the test ends (#86).
  global.fetch = jest
    .fn()
    .mockResolvedValue({ok: false, status: 404, text: async () => ''});
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
  now.mockRestore();
});

/** A host call that answers only when the test says so. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return {promise, resolve};
}

async function settle() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise(resolve => setImmediate(resolve));
    });
  }
}

/** The lifecycle listener the view registered. */
async function lifecycle(state: number) {
  const calls = (PluginManager.registerPluginLifeListener as jest.Mock).mock
    .calls;
  await act(async () => calls[calls.length - 1][0].onMsg({state}));
}

const shown = (tree: renderer.ReactTestRenderer) =>
  tree.root.findByProps({testID: 'query'}).props.value;

const startingText = (tree: renderer.ReactTestRenderer) =>
  JSON.stringify(tree.toJSON()).includes(copy['app.starting']);

describe('the latest opening wins (#44)', () => {
  it('reopens after a close during the session start, not «Starting…» for good', async () => {
    resetSessionForTests();
    const dir = deferred<string>();
    (PluginManager.getPluginDirPath as jest.Mock).mockReturnValue(dir.promise);
    (PluginCommAPI.getLassoElements as jest.Mock).mockReturnValue(ok([]));
    const tree = await mount();
    // Closed while the first start waits on the host, then opened again.
    await lifecycle(3);
    await lifecycle(2);
    await settle();
    await act(async () => dir.resolve('/p'));
    await settle();
    expect(startingText(tree)).toBe(false);
    expect(shown(tree)).toBe('');
    act(() => tree.unmount());
  });

  it('shows the new word when a press comes while the old recognition is pending', async () => {
    (PluginCommAPI.getLassoElements as jest.Mock).mockReturnValue(
      ok([{type: 700}]),
    );
    const old = deferred<unknown>();
    (PluginCommAPI.recognizeElements as jest.Mock).mockReturnValueOnce(
      old.promise,
    );
    startButtonQueue();
    const press = (PluginManager.registerButtonListener as jest.Mock).mock
      .calls[0][0].onButtonPress;
    const tree = await mount();
    // Closed during the recognition; a new word lassoed and its press sent with lifecycle 2.
    await lifecycle(3);
    (PluginCommAPI.recognizeElements as jest.Mock).mockReturnValue(ok('apple'));
    await act(async () => press({id: 200}));
    await lifecycle(2);
    await settle();
    await act(async () => old.resolve({success: true, result: 'soup'}));
    await settle();
    expect(shown(tree)).toBe('apple');
    act(() => tree.unmount());
  });

  it('a late insert from before a reopen does not close the new view', async () => {
    (PluginCommAPI.getLassoElements as jest.Mock).mockReturnValue(ok([]));
    const insert = deferred<unknown>();
    (insertPicture as jest.Mock).mockReturnValue(insert.promise);
    const tree = await mount();
    const onPick = tree.root.findByType(SearchScreen).props.onPick;
    let picked!: Promise<unknown>;
    await act(async () => {
      picked = onPick({id: 'x'}, 'soup');
    });
    await lifecycle(3);
    await lifecycle(2);
    await settle();
    await act(async () => {
      insert.resolve({ok: true, value: true});
      await picked;
    });
    expect(PluginManager.closePluginView).not.toHaveBeenCalled();
    expect(shown(tree)).toBe('');
    act(() => tree.unmount());
  });

  it('reads the lasso elements once per lasso opening', async () => {
    (PluginCommAPI.getLassoElements as jest.Mock).mockReturnValue(
      ok([{type: 700}]),
    );
    const tree = await mount();
    expect(shown(tree)).toBe('soup');
    expect(PluginCommAPI.getLassoElements).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });
});

describe('the session log of a new runtime (#58)', () => {
  const LOGS = '/s/MyStyle/Ink2Pic/logs';
  afterEach(() => {
    setAfterCall(() => {});
    closeLogFileForTests();
    delete NativeModules.Ink2PicFiles;
  });

  it('keeps the previous runtime lines in session.prev.log when the view decides on mount', async () => {
    const files: Record<string, string> = {
      [`${LOGS}/session.log`]: 'the previous runtime\n',
    };
    NativeModules.Ink2PicFiles = {
      writeText: jest.fn(async (path: string, text: string) => {
        files[path] = text;
        return null;
      }),
      readText: jest.fn(async (path: string) => files[path] ?? null),
      listDir: jest.fn(async () => null),
    };
    closeLogFileForTests();
    openLogFile(LOGS);
    setAfterCall(flushLogFile);
    // A fresh runtime with no pending press: the view decides on mount.
    (PluginCommAPI.getLassoElements as jest.Mock).mockReturnValue(ok([]));
    const tree = await mount();
    expect(files[`${LOGS}/session.prev.log`]).toBe('the previous runtime\n');
    expect(files[`${LOGS}/session.log`]).toContain('getLassoElements');
    act(() => tree.unmount());
  });
});
