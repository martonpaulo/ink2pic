/**
 * Search results as pages of six large tiles, for e-ink (brief section 8.4): no scrolling, no
 * animation, and each page shown once, when all its thumbnails have loaded or failed.
 */
import React, {useMemo, useState} from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {pageCount, pageOf} from '../search/pages';
import type {SearchResult} from '../sources/types';
import {copy} from './copy';
import {metrics} from './metrics';

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

  const settle = (id: string) =>
    setSettled(previous => new Set(previous).add(id));
  const ready = visible.every(result => settled.has(result.id));

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
        {visible.map(result => (
          <Pressable
            key={result.id}
            testID={`tile-${result.id}`}
            accessibilityRole="button"
            accessibilityLabel={result.title}
            style={styles.tile}
            onPress={() => onPick(result)}>
            <Image
              source={{uri: result.thumbUrl}}
              style={styles.image}
              resizeMode="contain"
              fadeDuration={0}
              onLoad={() => settle(result.id)}
              onError={() => settle(result.id)}
            />
          </Pressable>
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
  screen: {flex: 1, backgroundColor: metrics.paper, alignItems: 'center'},
  grid: {
    width: metrics.tileWidth * 2 + metrics.gap,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: metrics.gap,
  },
  hidden: {opacity: 0},
  tile: {
    width: metrics.tileWidth,
    height: metrics.tileHeight,
    borderWidth: metrics.border,
    borderColor: metrics.ink,
    backgroundColor: metrics.paper,
  },
  image: {flex: 1},
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
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
