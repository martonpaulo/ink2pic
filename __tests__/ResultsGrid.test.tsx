import {readFileSync} from 'fs';
import {join} from 'path';
import React from 'react';
import {Image, StyleSheet, Text} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {PAGE_SIZE, pageCount, pageOf} from '../src/search-core';
import type {SearchResult} from '../src/search-core';
import {copy} from '../src/ui/copy';
import {metrics} from '../src/ui/metrics';
import {ResultsGrid, THUMB_TIMEOUT_MS} from '../src/ui/ResultsGrid';

const result = (n: number): SearchResult => ({
  id: `openclipart:${n}`,
  source: 'openclipart',
  title: `Picture ${n}`,
  thumbUrl: `https://openclipart.org/image/400px/${n}`,
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
const gridOf = (tree: ReactTestRenderer) =>
  tree.root.findByProps({testID: 'grid'});
const tileIds = (tree: ReactTestRenderer) =>
  tree.root
    .findAll(
      node =>
        typeof node.props.testID === 'string' &&
        node.props.testID.startsWith('tile-') &&
        typeof node.type === 'string',
    )
    .map(node => node.props.testID.slice('tile-'.length));
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
      false,
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

  it('shows a page whose thumbnails never answer, without those tiles (#24, #64)', () => {
    jest.useFakeTimers();
    try {
      const tree = render();
      act(() => tree.root.findAllByType(Image)[0].props.onLoad());
      expect(gridOf(tree).props.accessibilityElementsHidden).toBe(true);
      act(() => jest.advanceTimersByTime(THUMB_TIMEOUT_MS));
      // Five tiles never answered: the two results left fill their places and load in turn.
      expect(tileIds(tree)).toEqual([
        'openclipart:1',
        'openclipart:7',
        'openclipart:8',
      ]);
      loadAll(tree);
      expect(gridOf(tree).props.accessibilityElementsHidden).toBe(false);
      expect(texts(tree)).toContain('1 / 1');
      expect(texts(tree)).not.toContain('Picture 2');
    } finally {
      jest.useRealTimers();
    }
  });

  it('drops a tile whose thumbnail failed and fills its place from the next result (#64)', () => {
    const tree = render();
    act(() => tree.root.findAllByType(Image)[2].props.onError());
    expect(tileIds(tree)).toEqual(
      [1, 2, 4, 5, 6, 7].map(n => `openclipart:${n}`),
    );
    // No tile ever shows its title instead of a picture.
    expect(texts(tree)).not.toContain('Picture 3');
    expect(texts(tree)).toContain('1 / 2');
    act(() => tree.root.findAllByType(Image)[0].props.onError());
    act(() => tree.root.findAllByType(Image)[0].props.onError());
    // Six results are left: one page, and next is disabled.
    expect(texts(tree)).toContain('1 / 1');
    expect(navButton(tree, copy['nav.nextLabel']).props.disabled).toBe(true);
    loadAll(tree);
    expect(gridOf(tree).props.accessibilityElementsHidden).toBe(false);
  });

  it('moves to the last page left when the open page loses every tile (#64)', () => {
    const tree = render();
    act(() => navButton(tree, copy['nav.nextLabel']).props.onPress());
    act(() =>
      tree.root.findAllByType(Image).forEach(img => img.props.onError()),
    );
    expect(texts(tree)).toContain('1 / 1');
    expect(tileIds(tree)).toHaveLength(PAGE_SIZE);
  });

  it('reads as no result when every thumbnail failed (#64)', () => {
    const tree = render({results: many(2)});
    act(() =>
      tree.root.findAllByType(Image).forEach(img => img.props.onError()),
    );
    expect(texts(tree)).toEqual([copy['search.empty']]);
  });

  it('lays every picture on paper white, so a transparent one never shows black (#64)', () => {
    const tree = render();
    const image = tree.root.findAllByType(Image)[0];
    expect(StyleSheet.flatten(image.props.style).backgroundColor).toBe(
      metrics.paper,
    );
    const tile = tree.root.findByProps({testID: 'tile-openclipart:1'});
    expect(StyleSheet.flatten(tile.props.style).backgroundColor).toBe(
      metrics.paper,
    );
    expect(metrics.paper).toBe('#ffffff');
  });

  it('sends the plugin User-Agent with each thumbnail (#24)', () => {
    const tree = render();
    const source = tree.root.findAllByType(Image)[0].props.source;
    expect(source.headers['User-Agent']).toMatch(/^Ink2Pic\//);
  });
});

describe('a later page measured as it loads (#72)', () => {
  const contourOf = (n: number) => `file:///p/thumbs/openclipart-${n}.contour.png`;
  const fileOf = (n: number) => `file:///p/thumbs/openclipart-${n}`;
  const uris = (tree: ReactTestRenderer) =>
    tree.root.findAllByType(Image).map(img => img.props.source.uri);
  const openPage3 = (tree: ReactTestRenderer) => {
    loadAll(tree);
    act(() => navButton(tree, copy['nav.nextLabel']).props.onPress());
    loadAll(tree);
    act(() => navButton(tree, copy['nav.nextLabel']).props.onPress());
  };

  it('measures only the results after pages 1 and 2, and shows page 3 with its contour tiles', async () => {
    const asked: string[] = [];
    let finish!: () => void;
    const measured = new Promise<void>(resolve => (finish = resolve));
    const measureLater = jest.fn(async (item: SearchResult) => {
      asked.push(item.id);
      await measured;
      const n = Number(item.id.split(':')[1]);
      return n === 13 ? contourOf(n) : fileOf(n);
    });
    const onPick = jest.fn();
    const tree = render({
      results: many(14),
      thumbDir: '/p',
      measureLater,
      onPick,
    });
    openPage3(tree);
    // Nothing of page 3 renders before its measures: what shows is what goes in.
    expect(asked).toEqual(['openclipart:13', 'openclipart:14']);
    expect(uris(tree)).toEqual([]);
    expect(gridOf(tree).props.style).toContainEqual(
      expect.objectContaining({opacity: 0}),
    );
    await act(async () => finish());
    expect(uris(tree)).toEqual([contourOf(13), fileOf(14)]);
    loadAll(tree);
    act(() => tree.root.findByProps({testID: 'tile-openclipart:13'}).props.onPress());
    act(() => tree.root.findByProps({testID: 'tile-openclipart:14'}).props.onPress());
    expect(onPick.mock.calls.map(call => call[1])).toEqual([true, false]);
  });

  it('inserts as found when the contour file cannot be shown and its web copy shows', async () => {
    const onPick = jest.fn();
    const tree = render({
      results: many(13),
      thumbDir: '/p',
      measureLater: async () => contourOf(13),
      onPick,
    });
    openPage3(tree);
    await act(async () => {});
    act(() => tree.root.findAllByType(Image)[0].props.onError());
    expect(uris(tree)).toEqual([result(13).thumbUrl]);
    loadAll(tree);
    act(() => tree.root.findByProps({testID: 'tile-openclipart:13'}).props.onPress());
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({id: 'openclipart:13'}),
      false,
    );
  });

  it('shows the contour drawing a new list chose for a picture shown as found', () => {
    const onPick = jest.fn();
    const tree = render({results: many(2), onPick});
    loadAll(tree);
    expect(uris(tree)[0]).toBe(result(1).thumbUrl);
    const again = many(2);
    act(() =>
      tree.update(
        <ResultsGrid
          results={again}
          searching={false}
          sourceDown={false}
          onPick={onPick}
          contourThumbs={new Map([[again[0].id, contourOf(1)]])}
        />,
      ),
    );
    expect(uris(tree)[0]).toBe(contourOf(1));
    loadAll(tree);
    expect(gridOf(tree).props.style).not.toContainEqual(
      expect.objectContaining({opacity: 0}),
    );
    act(() => tree.root.findByProps({testID: 'tile-openclipart:1'}).props.onPress());
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({id: 'openclipart:1'}),
      true,
    );
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
