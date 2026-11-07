/** The Languages screen (#68) and its route from the plugin's Settings entry. */
import React from 'react';
import {NativeModules, Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {PluginCommAPI, PluginManager} from 'sn-plugin-lib';
import App from '../App';
import {CONFIG_BUTTON_ID} from '../src/buttons';
import {logLines} from '../src/log/memory';
import {startConfigQueue} from '../src/sdk/buttons';
import type {LanguageCode} from '../src/settings/languages';
import {settingsPath} from '../src/storage/paths';
import {resetSessionForTests} from '../src/storage/session';
import {resetSettingsForTests} from '../src/storage/settings';
import {copy} from '../src/ui/copy';
import {LanguagesScreen} from '../src/ui/LanguagesScreen';
import {compilePlugin} from './host/journey';

// The startup test loads index.js afresh; its first compile happens here, outside the test (#107).
compilePlugin();

const ok = (result: unknown) => Promise.resolve({success: true, result});

/** Every button's spoken label, in screen order. */
function buttons(tree: renderer.ReactTestRenderer) {
  return tree.root
    .findAll(node => node.props.accessibilityRole === 'button')
    .map(node => ({
      label: node.props.accessibilityLabel as string,
      disabled: Boolean(node.props.accessibilityState?.disabled),
      press: node.props.onPress as () => void,
    }))
    .filter(
      (button, index, all) =>
        all.findIndex(other => other.label === button.label) === index,
    );
}

function texts(tree: renderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map(node => String(node.props.children));
}

function screen(languages: LanguageCode[]) {
  const onChange = jest.fn();
  const onReset = jest.fn();
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <LanguagesScreen
        languages={languages}
        onChange={onChange}
        onReset={onReset}
        onClose={() => {}}
      />,
    );
  });
  return {tree, onChange, onReset};
}

describe('LanguagesScreen (#68)', () => {
  it('numbers the rows and labels every button with its language', () => {
    const {tree} = screen(['zh', 'en']);
    expect(texts(tree)).toEqual(
      expect.arrayContaining([
        copy['languages.title'],
        copy['languages.hint'],
        '1. 中文 (Chinese)',
        '2. English',
        'Español',
        'Português',
      ]),
    );
    const labels = buttons(tree).map(button => button.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        'Move 中文 (Chinese) down',
        'Remove 中文 (Chinese)',
        'Move English up',
        'Remove English',
        'Add Español',
        'Add Português',
        copy['languages.reset'],
      ]),
    );
    // No ↑ on the first row, no ↓ on the last.
    expect(labels).not.toContain('Move 中文 (Chinese) up');
    expect(labels).not.toContain('Move English down');
  });

  it('disables Remove when one language is left', () => {
    const {tree} = screen(['en']);
    const remove = buttons(tree).find(b => b.label === 'Remove English');
    expect(remove?.disabled).toBe(true);
  });

  it('says why Remove is off for the last language, and only then (#98)', () => {
    expect(texts(screen(['en']).tree)).toContain(copy['languages.oneStays']);
    expect(texts(screen(['zh', 'en']).tree)).not.toContain(
      copy['languages.oneStays'],
    );
  });

  it('writes its section labels in sentence case, as every other label (#98)', () => {
    for (const key of ['languages.inUse', 'languages.addSection'] as const) {
      expect(copy[key]).not.toBe(copy[key].toUpperCase());
    }
  });

  it('ignores a second Remove within the repeat time, but keeps a later one (#97)', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(10_000);
    const {tree, onChange} = screen(['zh', 'en', 'es']);
    const press = (label: string) =>
      act(() =>
        buttons(tree)
          .find(b => b.label === label)
          ?.press(),
      );
    press('Remove 中文 (Chinese)');
    now.mockReturnValue(10_300);
    press('Remove English');
    expect(onChange).toHaveBeenCalledTimes(1);
    now.mockReturnValue(10_700);
    press('Remove English');
    expect(onChange).toHaveBeenCalledTimes(2);
    now.mockRestore();
  });

  it('sends each tap as one step', () => {
    const {tree, onChange} = screen(['zh', 'en']);
    act(() =>
      buttons(tree)
        .find(b => b.label === 'Move English up')
        ?.press(),
    );
    act(() =>
      buttons(tree)
        .find(b => b.label === 'Add Español')
        ?.press(),
    );
    expect(onChange.mock.calls).toEqual([
      [{type: 'up', code: 'en'}],
      [{type: 'add', code: 'es'}],
    ]);
  });

  it('asks before Reset, and Cancel keeps the list', () => {
    const {tree, onReset} = screen(['zh', 'en']);
    const reset = () =>
      buttons(tree)
        .find(b => b.label === copy['languages.reset'])
        ?.press();
    act(reset);
    expect(texts(tree)).toContain(copy['languages.resetQuestion']);
    act(() =>
      buttons(tree)
        .find(b => b.label === copy['action.cancel'])
        ?.press(),
    );
    expect(onReset).not.toHaveBeenCalled();
    expect(texts(tree)).not.toContain(copy['languages.resetQuestion']);
    act(reset);
    act(reset);
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});

describe('the Settings entry (#68)', () => {
  const files: Record<string, string> = {};

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    resetSessionForTests();
    resetSettingsForTests();
    for (const key of Object.keys(files)) {
      delete files[key];
    }
    NativeModules.Ink2PicFiles = {
      readText: jest.fn(async (path: string) => files[path] ?? null),
      writeText: jest.fn(async (path: string, text: string) => {
        files[path] = text;
        return null;
      }),
      listDir: jest.fn(async () => null),
    };
    (PluginManager.hasPermission as jest.Mock).mockResolvedValue(1);
    (PluginManager.getPluginDirPath as jest.Mock).mockResolvedValue('/p');
    (PluginCommAPI.getLassoElements as jest.Mock).mockReturnValue(ok([]));
  });

  afterEach(() => {
    delete NativeModules.Ink2PicFiles;
  });

  async function settle() {
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await new Promise(resolve => setImmediate(resolve));
      });
    }
  }

  it('opens Settings for a click that came before the view mounted, and saves a Languages tap', async () => {
    files[settingsPath()] = JSON.stringify({languages: ['zh', 'es', 'en']});
    startConfigQueue();
    const click = (PluginManager.registerConfigButtonListener as jest.Mock).mock
      .calls[0][0].onClick;
    click();
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<App />);
    });
    await settle();
    expect(logLines().join('\n')).toContain(
      `button ${CONFIG_BUTTON_ID} (pending)`,
    );
    // The Settings screen first (#70), then its Languages screen.
    expect(texts(tree)).toContain(copy['settings.title']);
    await act(async () =>
      buttons(tree)
        .find(b => b.label === copy['settings.languagesOpenLabel'])
        ?.press(),
    );
    expect(texts(tree)).toContain('1. 中文 (Chinese)');
    // The host's replay within its 1000 ms window is a duplicate.
    await act(async () => click());
    expect(logLines().join('\n')).toContain(
      `button ${CONFIG_BUTTON_ID} (live) already handled`,
    );
    await act(async () =>
      buttons(tree)
        .find(b => b.label === 'Move English up')
        ?.press(),
    );
    await settle();
    expect(texts(tree)).toContain('2. English');
    expect(JSON.parse(files[settingsPath()]).languages).toEqual([
      'zh',
      'en',
      'es',
    ]);
    act(() => tree.unmount());
  });

  it('keeps both of two taps that come before the screen redraws (#95)', async () => {
    files[settingsPath()] = JSON.stringify({languages: ['zh', 'es', 'en']});
    startConfigQueue();
    (
      PluginManager.registerConfigButtonListener as jest.Mock
    ).mock.calls[0][0].onClick();
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<App />);
    });
    await settle();
    await act(async () =>
      buttons(tree)
        .find(b => b.label === copy['settings.languagesOpenLabel'])
        ?.press(),
    );
    // Both taps reach the same rendered button: the second comes before the redraw.
    const up = buttons(tree).find(b => b.label === 'Move English up');
    await act(async () => {
      up?.press();
      up?.press();
    });
    await settle();
    expect(texts(tree)).toContain('1. English');
    expect(JSON.parse(files[settingsPath()]).languages).toEqual([
      'en',
      'zh',
      'es',
    ]);
    act(() => tree.unmount());
  });
});

it('registers the Settings entry at startup, and a click shows the view (#68)', async () => {
  // index.js in its own module registry, with that registry's SDK mock.
  let sdk!: {PluginManager: Record<string, jest.Mock>};
  jest.isolateModules(() => {
    sdk = require('sn-plugin-lib');
    sdk.PluginManager.registerButton.mockResolvedValue(true);
    sdk.PluginManager.registerConfigButton.mockResolvedValue(true);
    sdk.PluginManager.showPluginView.mockResolvedValue(true);
    require('../index');
  });
  const manager = sdk.PluginManager;
  expect(manager.registerConfigButton).toHaveBeenCalledTimes(1);
  expect(manager.registerLangListener).toHaveBeenCalledTimes(1);
  const click = manager.registerConfigButtonListener.mock.calls[0][0].onClick;
  await act(async () => click());
  expect(manager.showPluginView).toHaveBeenCalledTimes(1);
});
