import React from 'react';
import {Text, TextInput} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import type {Source} from '../src/search/search';
import type {SearchResult} from '../src/sources/types';
import {copy} from '../src/ui/copy';
import {SearchScreen} from '../src/ui/SearchScreen';

const result: SearchResult = {
  id: 'openclipart:1',
  source: 'openclipart',
  title: 'Soup bowl',
  thumbUrl: 'https://openclipart.org/image/400px/1',
  fullUrl: w => `https://openclipart.org/image/${w}px/1`,
  license: 'CC0 1.0',
  attribution: 'Openclipart',
};

let search: jest.Mock;
const sources = (): Source[] => [{name: 'fake', search}];

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

describe('SearchScreen (#13)', () => {
  it('submits the recognized word once and shows the results', async () => {
    const tree = await render();
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('soup');
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

  it('searches again with the fixed word', async () => {
    const tree = await render();
    const input = tree.root.findByType(TextInput);
    act(() => input.props.onChangeText('wine'));
    await act(async () =>
      tree.root.findByType(TextInput).props.onSubmitEditing(),
    );
    expect(search).toHaveBeenLastCalledWith('wine');
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

  it('runs the files check from the log and shows each line live (#11)', async () => {
    const tree = await render();
    const press = (label: string) =>
      tree.root
        .find(n => n.props.accessibilityLabel === label && n.props.onPress)
        .props.onPress();
    act(() => press(copy['action.log']));
    await act(async () => press(copy['action.checkFiles']));
    expect(texts(tree).join('\n')).toContain('Ink2PicFiles: not loaded');
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
