/**
 * Every failure in the flow reaches a visible message (#19, brief section 8.8).
 */
import React from 'react';
import {NativeModules, Text} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import type {Source} from '../src/search/search';
import type {SourceOutcome} from '../src/sources/types';
import {copy} from '../src/ui/copy';
import {isOffline, SearchScreen} from '../src/ui/SearchScreen';

const source = (name: string, outcome: SourceOutcome): Source => ({
  name,
  search: () => Promise.resolve(outcome),
});

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  delete NativeModules.Ink2PicFiles;
});
afterEach(() => jest.restoreAllMocks());

async function render(
  sources: Source[],
  props: {recognitionFailed?: boolean} = {},
) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SearchScreen
        initialQuery={props.recognitionFailed ? '' : 'soup'}
        recognitionFailed={props.recognitionFailed ?? false}
        onPick={jest.fn()}
        onClose={jest.fn()}
        sources={sources}
      />,
    );
  });
  return tree;
}
const texts = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(t => t.props.children);

describe('visible failures (#19)', () => {
  it('no network: says so and opens the library', async () => {
    const tree = await render([
      source('a', {
        ok: false,
        kind: 'network',
        message: 'Network request failed',
      }),
      source('b', {ok: false, kind: 'timeout', message: 'no answer'}),
    ]);
    expect(texts(tree)).toEqual(
      expect.arrayContaining([copy['error.offline'], copy['library.empty']]),
    );
    act(() => tree.unmount());
  });

  it('one source down and nothing found: names the failure', async () => {
    const tree = await render([
      source('a', {ok: false, kind: 'throttled', message: 'HTTP 429'}),
      source('b', {ok: true, results: []}),
    ]);
    expect(texts(tree)).toContain(copy['error.sourceDown']);
    act(() => tree.unmount());
  });

  it('recognition failed: says to type the word', async () => {
    const tree = await render([], {recognitionFailed: true});
    expect(texts(tree)).toContain(copy['error.recognition']);
    act(() => tree.unmount());
  });

  it('tells offline from a source error', () => {
    const statuses = {
      a: {state: 'failed' as const, kind: 'http' as const, message: 'HTTP 500'},
    };
    expect(
      isOffline({results: [], statuses, sourceDown: false, allFailed: true}),
    ).toBe(false);
  });
});
