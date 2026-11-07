/**
 * Search results as pages of six large tiles, for e-ink (brief section 8.4): no scrolling, no
 * animation, and each page shown once, when all its thumbnails have loaded. A result whose
 * thumbnail fails, from its file and then from the web, leaves the list: the next result takes its
 * place and the page count follows, so a page shows only pictures, never a title (#64). A thumbnail
 * not yet stored is downloaded to its file first and the tile renders the file: one request each
 * (#46). The grid says no sentence: it reports its note (searching, empty, loading) and the
 * screen's one status line says it, so no tile shrinks or repaints (#50, #98).
 * A transparent picture lies on paper white, never on black: the tile and the image are white
 * behind it (#64). Page 3 and later are measured as they load, before they show: a tile waits for
 * its contour drawing when it needs one, and a pick says whether the tile shows one (#72).
 */
import React, {useEffect, useMemo, useState} from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {USER_AGENT} from '../config';
import {isContourUri} from '../flow/measure';
import {
  cachedThumbUri,
  needsDownload,
  THUMB_TIMEOUT_MS,
  thumbUri,
} from '../search/thumbs';
import {MEASURED_RESULTS, PAGE_SIZE} from '../search-core';
import type {SearchResult} from '../search-core';
import {savedSymbolUri} from '../symbols/store';
import {Button} from './Button';
import {copy} from './copy';
import {metrics} from './metrics';
import {shared} from './styles';
import {
  keptTile,
  type KeptTile,
  nextTile,
  tilePage,
  tileUri,
  type Tile,
  type TileEvent,
} from './tiles';

/** Two tiles per row; the rows follow from PAGE_SIZE: three for six. */
const COLUMNS = 2;
const ROWS = Array.from(
  {length: Math.ceil(PAGE_SIZE / COLUMNS)},
  (_, row) => row,
);
const THUMB_HEADERS = {'User-Agent': USER_AGENT};

/** What the grid area lacks, for the screen's status line to say; null when the page shows. */
export type GridNote = 'searching' | 'empty' | 'loading' | null;

export type ResultsGridProps = {
  results: SearchResult[];
  searching: boolean;
  /** Called with each new note, and with null when the grid goes (#98). */
  onNote?: (note: GridNote) => void;
  /** `contour`: the tile shows the contour drawing, so that is what is inserted (#66, #72). */
  onPick: (result: SearchResult, contour: boolean) => void;
  /** The plugin folder whose stored thumbnails the grid reads and fills (#16); none for files. */
  thumbDir?: string | null;
  /** Thumbnails shown as the contour drawing that is inserted (#66): result id to file URI. */
  contourThumbs?: ReadonlyMap<string, string>;
  /**
   * The URI a tile after the first MEASURED_RESULTS shows, measured and converted as its page
   * loads (#72); with `thumbDir` only. Without it, those tiles show as found.
   */
  measureLater?: (result: SearchResult) => Promise<string>;
};

export function ResultsGrid({
  results,
  searching,
  onNote,
  onPick,
  thumbDir = null,
  contourThumbs,
  measureLater,
}: ResultsGridProps): React.JSX.Element {
  // The page belongs to one results list: a new list starts at page 1 in the same render.
  const [paging, setPaging] = useState({results, page: 0});
  const page = paging.results === results ? paging.page : 0;
  const setPage = (next: number) => setPaging({results, page: next});
  const measuring = Boolean(thumbDir && measureLater);
  // Chosen once per results list: the contour drawing that is inserted (#66), a saved symbol even
  // with no store (#99), the stored file, the web URL when there is no store, or null while the
  // thumbnail must be downloaded first (#46), or downloaded and measured first on page 3 and later
  // (#72).
  const thumbUris = useMemo(
    () =>
      new Map<string, string | null>(
        results.map((result, index) => [
          result.id,
          contourThumbs?.get(result.id) ??
            savedSymbolUri(result) ??
            (!thumbDir
              ? result.thumbUrl
              : (measuring && index >= MEASURED_RESULTS) ||
                needsDownload(result, thumbDir)
              ? null
              : cachedThumbUri(result, thumbDir)),
        ]),
      ),
    [results, thumbDir, contourThumbs, measuring],
  );
  // Each tile's state after its first one, by result id. It is kept across results lists: a tile
  // that keeps its key keeps its loaded image and fires no new onLoad, so a fresh state would hide
  // the page for good (#23), and a failed thumbnail stays out of every list this grid shows. A new
  // look chosen for the picture, its contour drawing or not, restarts the tile (#72).
  const [tiles, setTiles] = useState<ReadonlyMap<string, KeptTile>>(new Map());
  const keptIn = (map: ReadonlyMap<string, KeptTile>, result: SearchResult) =>
    keptTile(map.get(result.id), thumbUris.get(result.id) ?? null);
  const tileOf = (result: SearchResult): Tile => keptIn(tiles, result).tile;
  const send = (result: SearchResult, event: TileEvent) =>
    setTiles(previous => {
      const kept = keptIn(previous, result);
      return new Map(previous).set(result.id, {
        ...kept,
        tile: nextTile(kept.tile, event, result),
      });
    });

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

  // The page's missing thumbnails are downloaded to files, each once, before its tiles render; on
  // page 3 and later, also measured and converted when they need it (#72).
  useEffect(() => {
    if (!thumbDir) {
      return;
    }
    let live = true;
    for (const result of visible) {
      if (tileOf(result).status !== 'download') {
        continue;
      }
      const index = results.indexOf(result);
      const load =
        measureLater && index >= MEASURED_RESULTS
          ? measureLater(result)
          : thumbUri(result, thumbDir);
      load.then(uri => {
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

  // A list whose every thumbnail failed shows no picture, so it reads as no result.
  const note: GridNote = searching
    ? 'searching'
    : cut.empty
    ? 'empty'
    : ready
    ? null
    : 'loading';
  useEffect(() => {
    onNote?.(note);
  }, [note, onNote]);
  useEffect(() => () => onNote?.(null), [onNote]);

  // The area stays empty: the status line says the state's sentence (#98).
  if (note === 'searching' || note === 'empty') {
    return <View testID="grid-area" style={styles.frame} />;
  }

  return (
    <View style={styles.frame}>
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
                    onPress={() =>
                      onPick(
                        result,
                        isContourUri(tileUri(tileOf(result)) ?? ''),
                      )
                    }>
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
  frame: {flex: 1, alignSelf: 'stretch'},
  area: {flex: 1},
  grid: {flex: 1, gap: metrics.tileGap},
  row: {flex: 1, flexDirection: 'row', gap: metrics.tileGap},
  hidden: {opacity: 0},
  tile: {flex: 1, backgroundColor: metrics.paper},
  // White behind the picture itself, so a transparent thumbnail never lies on black (#64).
  image: {flex: 1, backgroundColor: metrics.paper},
  nav: {justifyContent: 'center', marginTop: metrics.sectionGap},
});
