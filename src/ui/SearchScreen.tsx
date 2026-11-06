/**
 * Search and Library (brief sections 8.2, 8.6, 8.8): the recognized word in an editable field,
 * already submitted; the results grid; the Library tab with saved pictures and recent searches,
 * which also opens by itself when there is no network; and the live log.
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {StyleSheet, Text, TextInput, View} from 'react-native';
import {libraryResults} from '../library/asResults';
import {getLibrary, recordSearch} from '../library/device';
import type {Library} from '../library/types';
import {
  Done,
  failureText,
  isOffline,
  offlineText,
  searchNotice,
  StepFailure,
} from '../flow/failure';
import {log} from '../log/memory';
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

type View_ = 'results' | 'library' | 'log';

export type SearchScreenProps = {
  /** The recognized word; empty when the sidebar opened the plugin. */
  initialQuery: string;
  /** Reading the lasso failed: show why, with the field empty and focused. */
  lassoFailure: StepFailure | null;
  /** Inserts the picture; a failure shows its sentence (#37). */
  onPick: (result: SearchResult, query: string) => Promise<Done<unknown>>;
  onClose: () => void;
  sources?: Source[];
};

export function SearchScreen({
  initialQuery,
  lassoFailure,
  onPick,
  onClose,
  sources,
}: SearchScreenProps): React.JSX.Element {
  const [query, setQuery] = useState(initialQuery);
  const [searching, setSearching] = useState(false);
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
  const [view, setView] = useState<View_>(initialQuery ? 'results' : 'library');
  const [status, setStatus] = useState<string | null>(
    lassoFailure ? failureText(lassoFailure) : null,
  );
  const [library, setLibrary] = useState<Library | null>(null);
  const [thumbDir, setThumbDir] = useState<string | null>(null);
  // One insert at a time: a second tap during a slow e-ink refresh would add a second picture.
  const inserting = useRef(false);
  // The newest search wins: an older one that ends later is ignored (#33).
  const latestSearch = useRef(0);

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
    if (inserting.current) {
      log(`picked ${result.id} while an insert runs: ignored`);
      return;
    }
    inserting.current = true;
    setStatus(copy['insert.running']);
    const inserted = await onPick(result, query.trim());
    inserting.current = false;
    if (inserted.ok) {
      setStatus(null);
      return;
    }
    log(
      `insert failed at ${inserted.step}: ${inserted.code} ${inserted.message}`,
    );
    // The sentence says what to do; the Log button stays for the detail (#37).
    setStatus(failureText(inserted));
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
      const ticket = ++latestSearch.current;
      log(`search "${word}"`);
      setSearching(true);
      // The stored thumbnails are listed while the search runs, so the grid knows them at once.
      const [result, dir] = await Promise.all([
        searchCached(word, sources ?? defaultSources()),
        prepareThumbs(),
      ]);
      setThumbDir(dir);
      if (ticket !== latestSearch.current) {
        log(`search "${word}" ended after a newer one: ignored`);
        return;
      }
      for (const [name, sourceStatus] of Object.entries(result.statuses)) {
        log(`source ${name}: ${JSON.stringify(sourceStatus)}`);
      }
      setOutcome(result);
      setSearching(false);
      if (isOffline(result)) {
        setStatus(await offlineText());
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
          autoFocus={lassoFailure !== null}
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
          emptyText={copy[(outcome && searchNotice(outcome)) ?? 'search.empty']}
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
