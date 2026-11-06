/**
 * Search results as pages of six large tiles, for e-ink (brief section 8.4): no scrolling, no
 * animation, and each page shown once, when all its thumbnails have loaded. A result whose
 * thumbnail fails, from its file and then from the web, leaves the list: the next result takes its
 * place and the page count follows, so a page shows only pictures, never a title (#64). A thumbnail
 * not yet stored is downloaded to its file first and the tile renders the file: one request each
 * (#46). Nothing is inserted above the tiles: the page's loading line lies over the hidden grid,
 * and the screen's own status line carries the source note, so no tile shrinks or repaints (#50).
 * A transparent picture lies on paper white, never on black: the tile and the image are white
 * behind it (#64).
 */
import React, {useEffect, useMemo, useState} from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {USER_AGENT} from '../config';
import {PAGE_SIZE} from '../search/pages';
import {cachedThumbUri, needsDownload, thumbUri} from '../search/thumbs';
import type {SearchResult} from '../sources/types';
import {Button} from './Button';
import {copy} from './copy';
import {metrics} from './metrics';
import {shared} from './styles';
import {
  initialTile,
  nextTile,
  tilePage,
  tileUri,
  type Tile,
  type TileEvent,
} from './tiles';

/**
 * A page shows at the latest after this, without its unanswered thumbnails (#24, #64).
 * shortcut: each round of replacements gets its own wait, so a server that never answers costs
 * one wait per round; bound the total if a device report shows a page waiting that long.
 */
export const THUMB_TIMEOUT_MS = 8000;
/** Two tiles per row; the rows follow from PAGE_SIZE: three for six. */
const COLUMNS = 2;
const ROWS = Array.from(
  {length: Math.ceil(PAGE_SIZE / COLUMNS)},
  (_, row) => row,
);
const THUMB_HEADERS = {'User-Agent': USER_AGENT};

export type ResultsGridProps = {
  results: SearchResult[];
  searching: boolean;
  /**
   * A source failed while another answered: with no result, this note replaces the empty text;
   * with results, the screen's status line says it (#50).
   */
  sourceDown: boolean;
  onPick: (result: SearchResult) => void;
  /** Shown when there is no result; the search's own text by default. */
  emptyText?: string;
  /** The plugin folder whose stored thumbnails the grid reads and fills (#16); none for files. */
  thumbDir?: string | null;
  /** Thumbnails shown as the contour drawing that is inserted (#66): result id to file URI. */
  contourThumbs?: ReadonlyMap<string, string>;
};

export function ResultsGrid({
  results,
  searching,
  sourceDown,
  onPick,
  emptyText = copy['search.empty'],
  thumbDir = null,
  contourThumbs,
}: ResultsGridProps): React.JSX.Element {
  // The page belongs to one results list: a new list starts at page 1 in the same render.
  const [paging, setPaging] = useState({results, page: 0});
  const page = paging.results === results ? paging.page : 0;
  const setPage = (next: number) => setPaging({results, page: next});
  // Chosen once per results list: the contour drawing that is inserted (#66), the stored file, the
  // web URL when there is no store, or null while the thumbnail must be downloaded first (#46).
  const thumbUris = useMemo(
    () =>
      new Map<string, string | null>(
        results.map(result => [
          result.id,
          contourThumbs?.get(result.id) ??
            (!thumbDir
              ? result.thumbUrl
              : needsDownload(result, thumbDir)
              ? null
              : cachedThumbUri(result, thumbDir)),
        ]),
      ),
    [results, thumbDir, contourThumbs],
  );
  // Each tile's state after its first one, by result id. It is kept across results lists: a tile
  // that keeps its key keeps its loaded image and fires no new onLoad, so a fresh state would hide
  // the page for good (#23), and a failed thumbnail stays out of every list this grid shows.
  const [tiles, setTiles] = useState<ReadonlyMap<string, Tile>>(new Map());
  const tileIn = (map: ReadonlyMap<string, Tile>, result: SearchResult) =>
    map.get(result.id) ?? initialTile(thumbUris.get(result.id) ?? null);
  const tileOf = (result: SearchResult): Tile => tileIn(tiles, result);
  const send = (result: SearchResult, event: TileEvent) =>
    setTiles(previous =>
      new Map(previous).set(
        result.id,
        nextTile(tileIn(previous, result), event, result),
      ),
    );

  const cut = tilePage(results, tileOf, page);
  const visibleIds = cut.visible.map(result => result.id).join('\n');
  // One array per results list and set of tiles on the page, not per loaded tile, so the
  // effects below run only when the page's tiles change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const visible = useMemo(() => cut.visible, [results, visibleIds]);
  const ready = visible.every(result => tileOf(result).status === 'ready');

  // A thumbnail that never answers must not hide the page: React Native's Image has no timeout.
  // A tile that loaded in the meantime ignores the timeout.
  useEffect(() => {
    if (ready) {
      return;
    }
    const timer = setTimeout(() => {
      for (const result of visible) {
        send(result, {type: 'timeout'});
      }
    }, THUMB_TIMEOUT_MS);
    return () => clearTimeout(timer);
    // The timer restarts per set of tiles on the page, not per loaded tile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, ready]);

  // The page's missing thumbnails are downloaded to files, each once, before its tiles render.
  useEffect(() => {
    if (!thumbDir) {
      return;
    }
    let live = true;
    for (const result of visible) {
      if (thumbUris.get(result.id) !== null) {
        continue;
      }
      thumbUri(result, thumbDir).then(uri => {
        if (live) {
          send(result, {type: 'downloaded', uri});
        }
      });
    }
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, thumbDir, thumbUris]);

  if (searching) {
    return <Text style={shared.text}>{copy['search.running']}</Text>;
  }
  // A list whose every thumbnail failed shows no picture, so it reads as no result.
  if (cut.empty) {
    return (
      <Text style={shared.text}>
        {sourceDown ? copy['error.sourceDown'] : emptyText}
      </Text>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.area}>
        <View
          testID="grid"
          style={[styles.grid, !ready && styles.hidden]}
          pointerEvents={ready ? 'auto' : 'none'}
          accessibilityElementsHidden={!ready}>
          {ROWS.map(row => (
            <View key={row} style={styles.row}>
              {visible
                .slice(row * COLUMNS, row * COLUMNS + COLUMNS)
                .map(result => (
                  <Pressable
                    key={result.id}
                    testID={`tile-${result.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={result.title}
                    style={[shared.outline, styles.tile]}
                    onPress={() => onPick(result)}>
                    {tileUri(tileOf(result)) === null ? null : (
                      <Image
                        source={{
                          uri: tileUri(tileOf(result)) as string,
                          headers: THUMB_HEADERS,
                        }}
                        style={styles.image}
                        resizeMode="contain"
                        fadeDuration={0}
                        onLoad={() => send(result, {type: 'loaded'})}
                        onError={() => send(result, {type: 'error'})}
                      />
                    )}
                  </Pressable>
                ))}
            </View>
          ))}
        </View>
        {/* The search has ended: only this page's thumbnails are loading (#35). */}
        {!ready && (
          <Text style={[shared.text, styles.over]}>{copy['page.loading']}</Text>
        )}
      </View>
      <View style={[shared.row, styles.nav]}>
        <Button
          label={copy['nav.previous']}
          accessibilityLabel={copy['nav.previousLabel']}
          disabled={cut.page === 0}
          onPress={() => setPage(cut.page - 1)}
        />
        <Text style={shared.text}>{`${cut.page + 1} / ${cut.pages}`}</Text>
        <Button
          label={copy['nav.next']}
          accessibilityLabel={copy['nav.nextLabel']}
          disabled={cut.page >= cut.pages - 1}
          onPress={() => setPage(cut.page + 1)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The grid takes the height left by the field and the page buttons, so the buttons are
  // always on screen (build 0.1.0 (6): fixed-size tiles pushed them under the Log button).
  screen: {flex: 1, alignSelf: 'stretch', backgroundColor: metrics.paper},
  area: {flex: 1},
  grid: {flex: 1, gap: metrics.tileGap},
  over: {position: 'absolute', top: 0, left: 0, right: 0},
  row: {flex: 1, flexDirection: 'row', gap: metrics.tileGap},
  hidden: {opacity: 0},
  tile: {flex: 1, backgroundColor: metrics.paper},
  // White behind the picture itself, so a transparent thumbnail never lies on black (#64).
  image: {flex: 1, backgroundColor: metrics.paper},
  nav: {justifyContent: 'center', marginTop: metrics.sectionGap},
});
