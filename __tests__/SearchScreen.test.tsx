import React from 'react';
import {Keyboard, Pressable, StyleSheet, Text, TextInput} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import type {SourceAdapter} from '../src/search-core';
import type {SearchResult} from '../src/search-core/types';
import {copy} from '../src/ui/copy';
import {metrics} from '../src/ui/metrics';
import {SearchScreen} from '../src/ui/SearchScreen';

const result: SearchResult = {
  id: 'openclipart:1',
  source: 'openclipart',
  title: 'Soup bowl',
  thumbUrl: 'https://openclipart.org/image/400px/1',
  license: 'CC0 1.0',
  attribution: 'Openclipart',
};

let search: jest.Mock;
const sources = (): SourceAdapter[] => [{name: 'fake', search}];

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  search = jest.fn().mockResolvedValue({ok: true, results: [result]});
});
afterEach(() => jest.restoreAllMocks());

async function render(
  props: Partial<React.ComponentProps<typeof SearchScreen>> = {},
) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SearchScreen
        initialQuery="soup"
        lassoFailure={null}
        onPick={jest.fn()}
        onClose={jest.fn()}
        sources={sources()}
        {...props}
      />,
    );
  });
  return tree;
}
const texts = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(t => t.props.children);
const status = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(Text).find(t => t.props.testID === 'status')!;
const statusText = (tree: ReactTestRenderer) => status(tree).props.children;
const button = (tree: ReactTestRenderer, label: string) =>
  tree.root
    .findAllByType(Pressable)
    .find(p => p.props.accessibilityLabel === label)!;

describe('SearchScreen (#13)', () => {
  it('submits the recognized word once and shows the results', async () => {
    const tree = await render();
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('soup', expect.anything());
    expect(tree.root.findByType(TextInput).props.value).toBe('soup');
    expect(tree.root.findByProps({testID: 'tile-openclipart:1'})).toBeTruthy();
    act(() => tree.unmount());
  });

  it('shows the recognition failure with an empty, focused field and no search', async () => {
    const tree = await render({
      initialQuery: '',
      lassoFailure: {ok: false, code: 117, message: 'bad size', step: 'lasso'},
    });
    expect(search).not.toHaveBeenCalled();
    const input = tree.root.findByType(TextInput);
    expect(input.props.value).toBe('');
    expect(input.props.autoFocus).toBe(true);
    expect(texts(tree)).toContain(copy['error.recognition']);
    act(() => tree.unmount());
  });

  it('opens a failed lasso on the empty results, not the Library (#50)', async () => {
    const tree = await render({
      initialQuery: '',
      lassoFailure: {ok: false, code: 117, message: 'bad size', step: 'lasso'},
    });
    expect(statusText(tree)).toBe(copy['error.recognition']);
    expect(texts(tree)).not.toContain(copy['library.empty']);
    expect(
      button(tree, copy['tab.library']).props.accessibilityState,
    ).toMatchObject({selected: false});
    act(() => tree.unmount());
  });

  it('never leaves an empty screen when the Library is closed before a search (#50)', async () => {
    const tree = await render({initialQuery: ''});
    expect(texts(tree)).toContain(copy['library.empty']);
    act(() => button(tree, copy['tab.library']).props.onPress());
    expect(statusText(tree)).toBe(copy['search.needWord']);
    act(() => tree.unmount());
  });

  it('says to type a word when Search runs on an empty field (#50)', async () => {
    const tree = await render({initialQuery: ''});
    act(() => tree.root.findByType(TextInput).props.onChangeText('  '));
    await act(async () => button(tree, copy['action.search']).props.onPress());
    expect(search).not.toHaveBeenCalled();
    expect(statusText(tree)).toBe(copy['search.needWord']);
    act(() => tree.unmount());
  });

  it('asks for a word in the field, not a fix (#50)', async () => {
    const tree = await render({initialQuery: ''});
    expect(tree.root.findByType(TextInput).props.placeholder).toBe(
      'Type a word',
    );
    act(() => tree.unmount());
  });

  it('keeps one status line under the bar in every state, so the tiles never move (#50)', async () => {
    let answer!: (value: unknown) => void;
    search.mockReturnValue(new Promise(resolve => (answer = resolve)));
    const tree = await render();
    const place = () => {
      const line = status(tree);
      const siblings = line.parent!.children;
      return siblings.indexOf(line);
    };
    expect(place()).toBe(1);
    expect(statusText(tree)).toBe('');
    await act(async () =>
      answer({ok: false, kind: 'http', message: 'HTTP 500'}),
    );
    expect(place()).toBe(1);
    act(() => button(tree, copy['action.log']).props.onPress());
    expect(place()).toBe(1);
    const style = StyleSheet.flatten(status(tree).props.style);
    expect(style.minHeight).toBe(2 * style.lineHeight);
    act(() => tree.unmount());
  });

  it('puts the source note in the status line, not above the tiles (#50)', async () => {
    const down: SourceAdapter = {
      name: 'down',
      search: () => Promise.resolve({ok: false, kind: 'http', message: 'x'}),
    };
    const tree = await render({sources: [{name: 'fake', search}, down]});
    expect(statusText(tree)).toBe(copy['error.sourceDown']);
    expect(
      texts(tree).filter(t => t === copy['error.sourceDown']),
    ).toHaveLength(1);
    act(() => tree.unmount());
  });

  it('fills Search black as the primary action and marks the open Library with a bar (#50)', async () => {
    const tree = await render({initialQuery: ''});
    const fill = (label: string) =>
      StyleSheet.flatten(button(tree, label).props.style).backgroundColor;
    expect(fill(copy['action.search'])).toBe(metrics.ink);
    expect(fill(copy['tab.library'])).toBe(metrics.paper);
    expect(
      button(tree, copy['tab.library']).findAllByProps({testID: 'selected-bar'})
        .length,
    ).toBeGreaterThan(0);
    act(() => tree.unmount());
  });

  it('takes the field placeholder, selection and cursor colours from the tokens (#53)', async () => {
    const tree = await render();
    const input = tree.root.findByType(TextInput);
    expect(input.props.placeholderTextColor).toBe(metrics.placeholder);
    expect(input.props.selectionColor).toBe(metrics.selection);
    expect(input.props.cursorColor).toBe(metrics.ink);
    // A field and its button share one height (interface rule 7).
    expect(StyleSheet.flatten(input.props.style).minHeight).toBe(
      metrics.controlHeight,
    );
    act(() => tree.unmount());
  });

  it('searches again with the fixed word, closing the keyboard (#42)', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    const tree = await render();
    dismiss.mockClear();
    const input = tree.root.findByType(TextInput);
    act(() => input.props.onChangeText('wine'));
    await act(async () =>
      tree.root.findByType(TextInput).props.onSubmitEditing(),
    );
    expect(search).toHaveBeenLastCalledWith('wine', expect.anything());
    expect(dismiss).toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('shows the call log on request', async () => {
    const tree = await render();
    const logButton = tree.root.find(
      n => n.props.accessibilityLabel === copy['action.log'] && n.props.onPress,
    );
    act(() => logButton.props.onPress());
    expect(texts(tree).join('\n')).toContain('search "soup"');
    act(() => tree.unmount());
  });

  it('shows the insert failure as a sentence and keeps the results (#12, #37)', async () => {
    const onPick = jest.fn().mockResolvedValue({
      ok: false,
      code: 107,
      message: 'bad element',
      step: 'place',
    });
    const tree = await render({onPick});
    await act(async () =>
      tree.root.findByProps({testID: 'tile-openclipart:1'}).props.onPress(),
    );
    expect(texts(tree)).toContain(copy['error.place']);
    expect(tree.root.findAllByProps({testID: 'log'})).toHaveLength(0);
    expect(tree.root.findByProps({testID: 'tile-openclipart:1'})).toBeTruthy();
    act(() => tree.unmount());
  });
});
