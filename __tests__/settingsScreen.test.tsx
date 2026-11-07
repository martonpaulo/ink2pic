/** The Settings screen (#70). */
import React from 'react';
import {Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {
  defaultSettings,
  Settings,
  SOURCE_NAMES,
} from '../src/settings/settings';
import {copy, CopyKey} from '../src/ui/copy';
import {SettingsScreen, SymbolsControl} from '../src/ui/SettingsScreen';

type Shown = {
  label: string;
  selected: boolean;
  disabled: boolean;
  press: () => void;
};

function buttons(tree: renderer.ReactTestRenderer): Shown[] {
  return tree.root
    .findAll(node => node.props.accessibilityRole === 'button')
    .map(node => ({
      label: node.props.accessibilityLabel as string,
      selected: Boolean(node.props.accessibilityState?.selected),
      disabled: Boolean(node.props.accessibilityState?.disabled),
      press: node.props.onPress as () => void,
    }))
    .filter(
      (button, index, all) =>
        all.findIndex(other => other.label === button.label) === index,
    );
}

const texts = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(node => String(node.props.children));

function screen(settings: Settings, cleared = true, symbols?: SymbolsControl) {
  const onChange = jest.fn();
  const onClear = jest.fn().mockResolvedValue(cleared);
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SettingsScreen
        settings={settings}
        onChange={onChange}
        onLanguages={() => {}}
        onClear={onClear}
        onClose={() => {}}
        {...(symbols && {symbols})}
      />,
    );
  });
  const press = (label: string) =>
    act(async () =>
      buttons(tree)
        .find(b => b.label === label)
        ?.press(),
    );
  return {tree, onChange, onClear, press};
}

it('shows each option with its current value selected', () => {
  const {tree} = screen(defaultSettings(null));
  const selected = buttons(tree)
    .filter(b => b.selected)
    .map(b => b.label);
  expect(selected).toEqual([
    copy['settings.size.medium'],
    copy['settings.placement.below'],
    copy['settings.style.drawings'],
    copy['settings.spacing.normal'],
    ...SOURCE_NAMES.map(name => copy[`source.${name}` as CopyKey]),
    copy['settings.dataSaver.off'],
  ]);
  expect(texts(tree)).toContain('English');
});

it('has a copy text for every source the search has', () => {
  for (const name of SOURCE_NAMES) {
    expect(copy[`source.${name}` as CopyKey]).toBeTruthy();
  }
});

it('sends a tap as one step', async () => {
  const {onChange, press} = screen(defaultSettings(null));
  await press(copy['settings.size.large']);
  await press(copy['settings.spacing.wide']);
  await press(copy['settings.dataSaver.on']);
  await press(copy['source.commons']);
  expect(onChange.mock.calls).toEqual([
    [{type: 'choose', key: 'size', value: 'large'}],
    [{type: 'choose', key: 'spacing', value: 'wide'}],
    [{type: 'dataSaver', on: true}],
    [{type: 'source', name: 'commons', on: false}],
  ]);
});

it('disables the last source that is on', () => {
  const settings = {
    ...defaultSettings(null),
    sourcesOff: SOURCE_NAMES.slice(1),
  };
  const {tree} = screen(settings);
  const last = buttons(tree).find(
    b => b.label === copy[`source.${SOURCE_NAMES[0]}` as CopyKey],
  );
  expect(last?.disabled).toBe(true);
});

it('asks before clearing, and says the files stay', async () => {
  const {tree, onClear, press} = screen(defaultSettings(null));
  await press(copy['settings.clear']);
  expect(texts(tree)).toContain(copy['settings.clearQuestion']);
  expect(copy['settings.clearQuestion']).toContain('MyStyle/Ink2Pic/library/');
  await press(copy['action.cancel']);
  expect(onClear).not.toHaveBeenCalled();
  await press(copy['settings.clear']);
  await press(copy['settings.clearConfirm']);
  expect(onClear).toHaveBeenCalledTimes(1);
  expect(texts(tree)).toContain(copy['settings.cleared']);
});

it('says when the list could not be cleared', async () => {
  const {tree, press} = screen(defaultSettings(null), false);
  await press(copy['settings.clear']);
  await press(copy['settings.clearConfirm']);
  expect(texts(tree)).toContain(copy['settings.clearFailed']);
});

it('asks before Reset all', async () => {
  const {tree, onChange, press} = screen(defaultSettings(null));
  await press(copy['settings.reset']);
  expect(texts(tree)).toContain(copy['settings.resetQuestion']);
  expect(onChange).not.toHaveBeenCalled();
  await press(copy['settings.reset']);
  expect(onChange).toHaveBeenCalledWith({type: 'reset', system: null});
});

/**
 * Offline symbols with `saved` of 1,447 on the device; the download ends at `stopAt`, stopped by
 * the network unless `failed` symbols were skipped and the rest finished.
 */
function fakeSymbols(saved: number, stopAt: number, failed = 0): SymbolsControl {
  const total = 1447;
  return {
    status: async () => ({total, saved}),
    download: async onProgress => {
      onProgress({total, saved: saved + 1});
      return {
        total,
        saved: stopAt,
        complete: stopAt === total,
        failed: failed || (stopAt === total ? 0 : 3),
        stopped: failed === 0,
      };
    },
  };
}

const settled = () => act(async () => {});

it('states the size of the symbols before downloading them (#91)', async () => {
  const symbols = fakeSymbols(47, 1447);
  const download = jest.spyOn(symbols, 'download');
  const {tree, press} = screen(defaultSettings(null), true, symbols);
  await settled();
  expect(texts(tree)).toContain('Offline symbols: 47 of 1,447');
  await press(copy['settings.symbolsDownload']);
  expect(texts(tree)).toContain(
    'Download 1,400 OpenMoji symbols, about 15 MB? They stay in MyStyle/Ink2Pic/symbols/, under CC BY-SA 4.0.',
  );
  await press(copy['action.cancel']);
  expect(download).not.toHaveBeenCalled();
  await press(copy['settings.symbolsDownload']);
  await press(copy['settings.symbolsConfirm']);
  expect(download).toHaveBeenCalledTimes(1);
  expect(texts(tree)).toContain(copy['settings.symbolsDone']);
  expect(texts(tree)).toContain(
    'Offline symbols: 1,447 of 1,447',
  );
});

it('reports how many symbols failed when the rest finished (#104)', async () => {
  const {tree, press} = screen(
    defaultSettings(null),
    true,
    fakeSymbols(0, 1445, 2),
  );
  await settled();
  await press(copy['settings.symbolsDownload']);
  await press(copy['settings.symbolsConfirm']);
  expect(texts(tree)).toContain(
    '1,445 of 1,447 symbols are saved. 2 could not be downloaded; download again to try them once more.',
  );
});

it('says where a cut download stopped, so a new tap resumes it (#91)', async () => {
  const {tree, press} = screen(
    defaultSettings(null),
    true,
    fakeSymbols(0, 300),
  );
  await settled();
  await press(copy['settings.symbolsDownload']);
  await press(copy['settings.symbolsConfirm']);
  expect(texts(tree)).toContain(
    'The download stopped at 300 of 1,447. Check the Wi-Fi, then download again to go on.',
  );
});
