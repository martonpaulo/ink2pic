/**
 * Search and Library (brief sections 8.2, 8.6, 8.8): the recognized word in an editable field,
 * already submitted; the results grid; the Library tab with saved pictures and recent searches,
 * which also opens by itself when there is no network; and the live log.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {StyleSheet, Text, TextInput, View} from 'react-native';
import {libraryResults} from '../library/asResults';
import {getLibrary, recordSearch} from '../library/device';
import type {Library} from '../library/types';
import {log} from '../log/memory';
import type {Result} from '../sdk/result';
import {searchCached} from '../search/device';
import {SearchOutcome, Source} from '../search/search';
import {defaultSources} from '../search/sources';
import {prepareThumbs} from '../search/thumbs';
import type {SearchResult} from '../sources/types';
import {probeWrite} from '../spike/probes';
import {Button} from './Button';
import {copy} from './copy';
import {LogView} from './LogView';
import {metrics} from './metrics';
import {ResultsGrid} from './ResultsGrid';

/** Failure kinds that mean the device has no network, not that one source is down. */
const OFFLINE_KINDS = new Set(['network', 'timeout']);

type View_ = 'results' | 'library' | 'log';

export type SearchScreenProps = {
  /** The recognized word; empty when the sidebar opened the plugin. */
  initialQuery: string;
  /** Recognition failed: show why, with the field empty and focused. */
  recognitionFailed: boolean;
  /** Inserts the picture; a failure is shown with the log. */
  onPick: (result: SearchResult, query: string) => Promise<Result<unknown>>;
  onClose: () => void;
  sources?: Source[];
};

export function isOffline(outcome: SearchOutcome): boolean {
  return (
    outcome.allFailed &&
    Object.values(outcome.statuses).every(
      status => status.state === 'failed' && OFFLINE_KINDS.has(status.kind),
    )
  );
}

export function SearchScreen({
  initialQuery,
  recognitionFailed,
  onPick,
  onClose,
  sources,
}: SearchScreenProps): React.JSX.Element {
  const [query, setQuery] = useState(initialQuery);
  const [searching, setSearching] = useState(false);
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
  const [view, setView] = useState<View_>(initialQuery ? 'results' : 'library');
  const [status, setStatus] = useState<string | null>(
    recognitionFailed ? copy['error.recognition'] : null,
  );
  const [library, setLibrary] = useState<Library | null>(null);
  const [thumbDir, setThumbDir] = useState<string | null>(null);

  useEffect(() => {
    getLibrary().then(setLibrary);
  }, []);

  // Logs its start at once and any error, so a failure is never silent (build 0.1.0 (6)).
  const checkFiles = async () => {
    log('check files: start');
    try {
      const section = await probeWrite();
      log(`check files: done, ${section.lines.join(' | ')}`);
    } catch (error) {
      log(`check files: failed: ${String(error)}`);
    }
  };

  const pick = async (result: SearchResult) => {
    setStatus(copy['insert.running']);
    const inserted = await onPick(result, query.trim());
    if (inserted.ok) {
      setStatus(null);
      return;
    }
    setStatus(copy['error.insert']);
    setView('log');
  };

  const search = useCallback(
    async (text: string) => {
      const word = text.trim();
      if (!word) {
        return;
      }
      setQuery(word);
      setView('results');
      setStatus(null);
      log(`search "${word}"`);
      setSearching(true);
      // The stored thumbnails are listed while the search runs, so the grid knows them at once.
      const [result, dir] = await Promise.all([
        searchCached(word, sources ?? defaultSources()),
        prepareThumbs(),
      ]);
      setThumbDir(dir);
      for (const [name, sourceStatus] of Object.entries(result.statuses)) {
        log(`source ${name}: ${JSON.stringify(sourceStatus)}`);
      }
      setOutcome(result);
      setSearching(false);
      if (isOffline(result)) {
        setStatus(copy['error.offline']);
        setView('library');
        return;
      }
      if (!result.allFailed) {
        await recordSearch(word);
        setLibrary(await getLibrary());
      }
    },
    [sources],
  );

  useEffect(() => {
    if (initialQuery) {
      search(initialQuery);
    }
    // Submitted once, when the screen opens with a recognized word.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (next: View_) => setView(view === next ? 'results' : next);

  return (
    <View style={styles.screen}>
      <View style={styles.bar}>
        <TextInput
          testID="query"
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => search(query)}
          placeholder={copy['search.placeholder']}
          accessibilityLabel={copy['search.placeholder']}
          autoFocus={recognitionFailed}
          returnKeyType="search"
        />
        <Button label={copy['action.search']} onPress={() => search(query)} />
        <Button
          label={copy['tab.library']}
          selected={view === 'library'}
          onPress={() => toggle('library')}
        />
        <Button
          label={copy['action.log']}
          selected={view === 'log'}
          onPress={() => toggle('log')}
        />
        <Button label={copy['action.close']} onPress={onClose} />
      </View>
      {status && <Text style={styles.text}>{status}</Text>}
      {view === 'log' && (
        <View style={styles.column}>
          <Button label={copy['action.checkFiles']} onPress={checkFiles} />
          <LogView />
        </View>
      )}
      {view === 'library' && (
        <View style={styles.fill}>
          {library && library.recentSearches.length > 0 && (
            <View style={styles.recent}>
              <Text style={styles.text}>{copy['search.recent']}</Text>
              {library.recentSearches.map(word => (
                <Button key={word} label={word} onPress={() => search(word)} />
              ))}
            </View>
          )}
          <ResultsGrid
            results={library ? libraryResults(library.items) : []}
            searching={!library}
            sourceDown={false}
            emptyText={copy['library.empty']}
            onPick={pick}
          />
        </View>
      )}
      {view === 'results' && (searching || outcome) && (
        <ResultsGrid
          results={outcome?.results ?? []}
          searching={searching}
          sourceDown={outcome?.sourceDown ?? false}
          onPick={pick}
          thumbDir={thumbDir}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: metrics.paper,
    padding: metrics.gap,
    gap: metrics.gap,
  },
  bar: {flexDirection: 'row', gap: metrics.gap, alignItems: 'center'},
  input: {
    flex: 1,
    minHeight: metrics.buttonHeight,
    borderWidth: metrics.border,
    borderColor: metrics.ink,
    fontSize: metrics.bodyFont,
    color: metrics.ink,
    paddingHorizontal: metrics.gap,
  },
  text: {fontSize: metrics.bodyFont, color: metrics.ink},
  column: {gap: metrics.gap, alignItems: 'flex-start'},
  fill: {flex: 1, gap: metrics.gap},
  recent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: metrics.gap,
    alignItems: 'center',
  },
});
