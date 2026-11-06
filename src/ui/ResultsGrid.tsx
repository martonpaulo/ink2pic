/**
 * Search results as pages of six large tiles, for e-ink (brief section 8.4): no scrolling, no
 * animation, and each page shown once, when all its thumbnails have loaded or failed.
 */
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {USER_AGENT} from '../config';
import {pageCount, pageOf} from '../search/pages';
import type {SearchResult} from '../sources/types';
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
};

export function ResultsGrid({
  results,
  searching,
  sourceDown,
  onPick,
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

  if (searching) {
    return <Text style={styles.message}>{copy['search.running']}</Text>;
  }
  if (results.length === 0) {
    return (
      <Text style={styles.message}>
        {sourceDown ? copy['error.sourceDown'] : copy['search.empty']}
      </Text>
    );
  }

  return (
    <View style={styles.screen}>
      {sourceDown && (
        <Text style={styles.note}>{copy['error.sourceDown']}</Text>
      )}
      {!ready && <Text style={styles.message}>{copy['search.running']}</Text>}
      <View
        testID="grid"
        style={[styles.grid, !ready && styles.hidden]}
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
                  ) : (
                    <Image
                      source={{uri: result.thumbUrl, headers: THUMB_HEADERS}}
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
        <NavButton
          label={copy['nav.previous']}
          accessibilityLabel={copy['nav.previousLabel']}
          disabled={page === 0}
          onPress={() => setPage(page - 1)}
        />
        <Text style={styles.pageNumber}>{`${page + 1} / ${pages}`}</Text>
        <NavButton
          label={copy['nav.next']}
          accessibilityLabel={copy['nav.nextLabel']}
          disabled={page >= pages - 1}
          onPress={() => setPage(page + 1)}
        />
      </View>
    </View>
  );
}

type NavButtonProps = {
  label: string;
  accessibilityLabel: string;
  disabled: boolean;
  onPress: () => void;
};

function NavButton({
  label,
  accessibilityLabel,
  disabled,
  onPress,
}: NavButtonProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{disabled}}
      disabled={disabled}
      style={[styles.navButton, disabled && styles.navDisabled]}
      onPress={onPress}>
      <Text style={styles.navText}>{label}</Text>
    </Pressable>
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
  navButton: {
    minWidth: metrics.buttonHeight * 2,
    height: metrics.buttonHeight,
    borderWidth: metrics.border,
    borderColor: metrics.ink,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navDisabled: {borderStyle: 'dashed'},
  navText: {fontSize: metrics.bodyFont, color: metrics.ink},
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
