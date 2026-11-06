/**
 * Search results as pages of six large tiles, for e-ink (brief section 8.4): no scrolling, no
 * animation, and each page shown once, when all its thumbnails have loaded or failed. A thumbnail
 * not yet stored is downloaded to its file first and the tile renders the file: one request each
 * (#46).
 */
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {USER_AGENT} from '../config';
import {pageCount, pageOf} from '../search/pages';
import {cachedThumbUri, needsDownload, thumbUri} from '../search/thumbs';
import type {SearchResult} from '../sources/types';
import {Button} from './Button';
import {copy} from './copy';
import {metrics} from './metrics';

/** A page shows at the latest after this, with unanswered thumbnails marked failed (#24). */
export const THUMB_TIMEOUT_MS = 8000;
/** Two tiles per row, three rows: the six of PAGE_SIZE. */
const COLUMNS = 2;
const THUMB_HEADERS = {'User-Agent': USER_AGENT};

export type ResultsGridProps = {
  results: SearchResult[];
  searching: boolean;
  /** A source failed while another answered; with no result, this note replaces the empty text. */
  sourceDown: boolean;
  onPick: (result: SearchResult) => void;
  /** Shown when there is no result; the search's own text by default. */
  emptyText?: string;
  /** The plugin folder whose stored thumbnails the grid reads and fills (#16); none for files. */
  thumbDir?: string | null;
};

export function ResultsGrid({
  results,
  searching,
  sourceDown,
  onPick,
  emptyText = copy['search.empty'],
  thumbDir = null,
}: ResultsGridProps): React.JSX.Element {
  // The page belongs to one results list: a new list starts at page 1 in the same render.
  const [paging, setPaging] = useState({results, page: 0});
  const page = paging.results === results ? paging.page : 0;
  const setPage = (next: number) => setPaging({results, page: next});
  // Settled ids only grow: a tile that keeps its key keeps its loaded image and fires no new
  // onLoad, so clearing the set would hide the page for good.
  const [settled, setSettled] = useState<ReadonlySet<string>>(new Set());
  const pages = pageCount(results.length);
  const visible = useMemo(() => pageOf(results, page), [results, page]);

  // Chosen once per results list: the stored file, the web URL when there is no store, or null
  // while the thumbnail must be downloaded first (#46).
  const thumbUris = useMemo(
    () =>
      new Map<string, string | null>(
        results.map(result => [
          result.id,
          !thumbDir
            ? result.thumbUrl
            : needsDownload(result, thumbDir)
            ? null
            : cachedThumbUri(result, thumbDir),
        ]),
      ),
    [results, thumbDir],
  );
  // The URIs of thumbnails downloaded for this results list, as each download ends.
  const [fetched, setFetched] = useState<{
    results: SearchResult[];
    uris: ReadonlyMap<string, string>;
  }>({results, uris: new Map()});
  const fetchedUris = fetched.results === results ? fetched.uris : null;
  const uriOf = (result: SearchResult): string | null =>
    fetchedUris?.get(result.id) ?? thumbUris.get(result.id) ?? null;

  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());

  // The page timer reads the latest settled ids, not the ones of the render that started it.
  const settledNow = useRef(settled);
  settledNow.current = settled;

  const settle = (id: string) =>
    setSettled(previous => new Set(previous).add(id));
  const fail = (id: string) => {
    setFailed(previous => new Set(previous).add(id));
    settle(id);
  };
  const ready = visible.every(result => settled.has(result.id));

  // A thumbnail that never answers must not hide the page: React Native's Image has no timeout.
  useEffect(() => {
    if (ready) {
      return;
    }
    const timer = setTimeout(() => {
      for (const result of visible) {
        if (!settledNow.current.has(result.id)) {
          fail(result.id);
        }
      }
    }, THUMB_TIMEOUT_MS);
    return () => clearTimeout(timer);
    // The timer restarts per page, not per settled tile.
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
        if (!live) {
          return;
        }
        setFetched(previous => ({
          results,
          uris: new Map(previous.results === results ? previous.uris : []).set(
            result.id,
            uri,
          ),
        }));
      });
    }
    return () => {
      live = false;
    };
  }, [visible, thumbDir, thumbUris, results]);

  if (searching) {
    return <Text style={styles.message}>{copy['search.running']}</Text>;
  }
  if (results.length === 0) {
    return (
      <Text style={styles.message}>
        {sourceDown ? copy['error.sourceDown'] : emptyText}
      </Text>
    );
  }

  return (
    <View style={styles.screen}>
      {sourceDown && (
        <Text style={styles.note}>{copy['error.sourceDown']}</Text>
      )}
      {/* The search has ended: only this page's thumbnails are loading (#35). */}
      {!ready && <Text style={styles.message}>{copy['page.loading']}</Text>}
      <View
        testID="grid"
        style={[styles.grid, !ready && styles.hidden]}
        pointerEvents={ready ? 'auto' : 'none'}
        accessibilityElementsHidden={!ready}>
        {[0, 1, 2].map(row => (
          <View key={row} style={styles.row}>
            {visible
              .slice(row * COLUMNS, row * COLUMNS + COLUMNS)
              .map(result => (
                <Pressable
                  key={result.id}
                  testID={`tile-${result.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={result.title}
                  style={styles.tile}
                  onPress={() => onPick(result)}>
                  {failed.has(result.id) ? (
                    <Text style={styles.failedTitle}>{result.title}</Text>
                  ) : uriOf(result) === null ? null : (
                    <Image
                      source={{
                        uri: uriOf(result) as string,
                        headers: THUMB_HEADERS,
                      }}
                      style={styles.image}
                      resizeMode="contain"
                      fadeDuration={0}
                      onLoad={() => settle(result.id)}
                      onError={() => fail(result.id)}
                    />
                  )}
                </Pressable>
              ))}
          </View>
        ))}
      </View>
      <View style={styles.nav}>
        <Button
          label={copy['nav.previous']}
          accessibilityLabel={copy['nav.previousLabel']}
          disabled={page === 0}
          onPress={() => setPage(page - 1)}
        />
        <Text style={styles.pageNumber}>{`${page + 1} / ${pages}`}</Text>
        <Button
          label={copy['nav.next']}
          accessibilityLabel={copy['nav.nextLabel']}
          disabled={page >= pages - 1}
          onPress={() => setPage(page + 1)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The grid takes the height left by the field and the page buttons, so the buttons are
  // always on screen (build 0.1.0 (6): fixed-size tiles pushed them under the Log button).
  screen: {flex: 1, alignSelf: 'stretch', backgroundColor: metrics.paper},
  grid: {flex: 1, gap: metrics.gap},
  row: {flex: 1, flexDirection: 'row', gap: metrics.gap},
  hidden: {opacity: 0},
  tile: {
    flex: 1,
    borderWidth: metrics.border,
    borderColor: metrics.ink,
    backgroundColor: metrics.paper,
  },
  image: {flex: 1},
  failedTitle: {
    fontSize: metrics.bodyFont,
    color: metrics.ink,
    margin: metrics.gap,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: metrics.gap,
    marginTop: metrics.gap,
  },
  pageNumber: {fontSize: metrics.bodyFont, color: metrics.ink},
  message: {
    fontSize: metrics.bodyFont,
    color: metrics.ink,
    margin: metrics.gap,
  },
  note: {
    fontSize: metrics.bodyFont,
    color: metrics.ink,
    marginBottom: metrics.gap,
  },
});
