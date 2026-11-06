import {readFileSync} from 'fs';
import {join} from 'path';
import React from 'react';
import {Image, StyleSheet, Text} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {PAGE_SIZE, pageCount, pageOf} from '../src/search/pages';
import type {SearchResult} from '../src/sources/types';
import {copy} from '../src/ui/copy';
import {ResultsGrid, THUMB_TIMEOUT_MS} from '../src/ui/ResultsGrid';

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

const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach(tree => tree.unmount()));
});

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
  mounted.push(tree);
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

  it('lays the page out in rows of two, as many as PAGE_SIZE needs (#53)', () => {
    // The host view of the grid: its children are the rows.
    const grid = render().root.find(
      node => node.props.testID === 'grid' && typeof node.type === 'string',
    );
    expect(grid.children).toHaveLength(Math.ceil(PAGE_SIZE / 2));
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
    // The search has ended: the page says it loads pictures, never «Searching…» (#35).
    expect(texts(tree)).toContain(copy['page.loading']);
    expect(texts(tree)).not.toContain(copy['search.running']);
    act(() => tree.root.findAllByType(Image)[0].props.onError());
    expect(grid().props.accessibilityElementsHidden).toBe(true);
    loadAll(tree);
    expect(grid().props.accessibilityElementsHidden).toBe(false);
    expect(texts(tree)).not.toContain(copy['page.loading']);
  });

  it('shows the running, empty and source-down states', () => {
    expect(texts(render({searching: true}))).toEqual([copy['search.running']]);
    expect(texts(render({results: []}))).toEqual([copy['search.empty']]);
    // With results, the screen's status line carries the note: nothing above the tiles (#50).
    expect(texts(render({sourceDown: true}))).not.toContain(
      copy['error.sourceDown'],
    );
  });

  it('lays the loading line over the hidden grid, so no tile shrinks (#50)', () => {
    const tree = render();
    const loading = tree.root
      .findAllByType(Text)
      .find(t => t.props.children === copy['page.loading'])!;
    expect(StyleSheet.flatten(loading.props.style)).toMatchObject({
      position: 'absolute',
    });
    // The grid is the first thing in its area, with or without the loading line.
    const grid = tree.root.findByProps({testID: 'grid'});
    expect(grid.parent!.children[0]).toBe(grid);
  });

  it('starts its messages on the screen edge, with no margin of their own (#50)', () => {
    for (const props of [{searching: true}, {results: []}]) {
      const style = StyleSheet.flatten(
        render(props).root.findByType(Text).props.style,
      );
      expect(style.margin).toBeUndefined();
      expect(style.marginLeft).toBeUndefined();
    }
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

  it('shows a page whose thumbnails never answer, with those tiles failed (#24)', () => {
    jest.useFakeTimers();
    try {
      const tree = render();
      act(() => tree.root.findAllByType(Image)[0].props.onLoad());
      expect(
        tree.root.findByProps({testID: 'grid'}).props
          .accessibilityElementsHidden,
      ).toBe(true);
      act(() => jest.advanceTimersByTime(THUMB_TIMEOUT_MS));
      expect(
        tree.root.findByProps({testID: 'grid'}).props
          .accessibilityElementsHidden,
      ).toBe(false);
      expect(tree.root.findAllByType(Image)).toHaveLength(1);
      expect(texts(tree)).toEqual(
        expect.arrayContaining(['Picture 2', 'Picture 6']),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows the title of a tile whose thumbnail failed (#24)', () => {
    const tree = render();
    act(() => tree.root.findAllByType(Image)[2].props.onError());
    expect(texts(tree)).toContain('Picture 3');
  });

  it('sends the plugin User-Agent with each thumbnail (#24)', () => {
    const tree = render();
    const source = tree.root.findAllByType(Image)[0].props.source;
    expect(source.headers['User-Agent']).toMatch(/^Ink2Pic\//);
  });
});

describe('hidden grid (#47)', () => {
  it('takes no tap while the page is loading', () => {
    const tree = render();
    const grid = () => tree.root.find(node => node.props.testID === 'grid');
    expect(grid().props.pointerEvents).toBe('none');
    loadAll(tree);
    expect(grid().props.pointerEvents).toBe('auto');
  });
});
