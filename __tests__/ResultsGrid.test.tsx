import {readFileSync} from 'fs';
import {join} from 'path';
import React from 'react';
import {Image, Text} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {pageCount, pageOf} from '../src/search/pages';
import type {SearchResult} from '../src/sources/types';
import {copy} from '../src/ui/copy';
import {ResultsGrid} from '../src/ui/ResultsGrid';

const result = (n: number): SearchResult => ({
  id: `openclipart:${n}`,
  source: 'openclipart',
  title: `Picture ${n}`,
  thumbUrl: `https://openclipart.org/image/400px/${n}`,
  fullUrl: w => `https://openclipart.org/image/${w}px/${n}`,
  license: 'CC0 1.0',
  attribution: 'Openclipart',
});
const many = (count: number) =>
  Array.from({length: count}, (_, i) => result(i + 1));

function render(props: Partial<React.ComponentProps<typeof ResultsGrid>> = {}) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <ResultsGrid
        results={many(8)}
        searching={false}
        sourceDown={false}
        onPick={jest.fn()}
        {...props}
      />,
    );
  });
  return tree;
}

const texts = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(t => t.props.children);
const navButton = (tree: ReactTestRenderer, label: string) =>
  tree.root.find(
    node => node.props.accessibilityLabel === label && node.props.onPress,
  );
const loadAll = (tree: ReactTestRenderer) =>
  act(() => tree.root.findAllByType(Image).forEach(img => img.props.onLoad()));

describe('pages', () => {
  it('splits into pages of six', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(13)).toBe(3);
    expect(pageOf(many(8), 1).map(r => r.id)).toEqual([
      'openclipart:7',
      'openclipart:8',
    ]);
  });
});

describe('ResultsGrid', () => {
  it('shows six tiles with the previous button disabled on the first page', () => {
    const tree = render();
    expect(tree.root.findAllByType(Image)).toHaveLength(6);
    expect(navButton(tree, copy['nav.previousLabel']).props.disabled).toBe(
      true,
    );
    expect(navButton(tree, copy['nav.nextLabel']).props.disabled).toBe(false);
  });

  it('disables next on the last page', () => {
    const tree = render();
    act(() => navButton(tree, copy['nav.nextLabel']).props.onPress());
    expect(tree.root.findAllByType(Image)).toHaveLength(2);
    expect(navButton(tree, copy['nav.nextLabel']).props.disabled).toBe(true);
  });

  it('hides the page until every thumbnail settled', () => {
    const tree = render();
    const grid = () => tree.root.findByProps({testID: 'grid'});
    expect(grid().props.accessibilityElementsHidden).toBe(true);
    expect(texts(tree)).toContain(copy['search.running']);
    act(() => tree.root.findAllByType(Image)[0].props.onError());
    expect(grid().props.accessibilityElementsHidden).toBe(true);
    loadAll(tree);
    expect(grid().props.accessibilityElementsHidden).toBe(false);
    expect(texts(tree)).not.toContain(copy['search.running']);
  });

  it('shows the running, empty and source-down states', () => {
    expect(texts(render({searching: true}))).toEqual([copy['search.running']]);
    expect(texts(render({results: []}))).toEqual([copy['search.empty']]);
    expect(texts(render({sourceDown: true}))).toContain(
      copy['error.sourceDown'],
    );
  });

  it('labels each tile with its title and picks it on press', () => {
    const onPick = jest.fn();
    const tree = render({onPick});
    const tile = tree.root.findByProps({testID: 'tile-openclipart:2'});
    expect(tile.props.accessibilityLabel).toBe('Picture 2');
    act(() => tile.props.onPress());
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({id: 'openclipart:2'}),
    );
  });

  it('uses no scrolling or animation', () => {
    const source = readFileSync(
      join(__dirname, '..', 'src', 'ui', 'ResultsGrid.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(/\b(ScrollView|FlatList|Animated)\b/);
  });

  it('stays visible when the same items arrive in a new list (#23)', () => {
    const tree = render();
    loadAll(tree);
    act(() => {
      tree.update(
        <ResultsGrid
          results={many(8)}
          searching={false}
          sourceDown={false}
          onPick={jest.fn()}
        />,
      );
    });
    expect(
      tree.root.findByProps({testID: 'grid'}).props.accessibilityElementsHidden,
    ).toBe(false);
  });

  it('shows page 1 of a new list in its first render (#23)', () => {
    const tree = render();
    act(() => navButton(tree, copy['nav.nextLabel']).props.onPress());
    act(() => {
      tree.update(
        <ResultsGrid
          results={many(3)}
          searching={false}
          sourceDown={false}
          onPick={jest.fn()}
        />,
      );
    });
    expect(tree.root.findAllByType(Image)).toHaveLength(3);
    expect(texts(tree)).toContain('1 / 1');
  });

  it('shows the failure, not the empty text, when a source failed and none matched (#23)', () => {
    expect(texts(render({results: [], sourceDown: true}))).toEqual([
      copy['error.sourceDown'],
    ]);
  });
});
