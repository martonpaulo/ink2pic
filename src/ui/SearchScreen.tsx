/**
 * Search and Library (brief sections 8.2, 8.6, 8.8): the recognized word in an editable field,
 * already submitted; the results grid; the Library tab with saved pictures and recent searches,
 * which also opens by itself when there is no network; and the live log. One status line under
 * the bar is always there, so a message never moves or shrinks the tiles on e-ink (#50).
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Keyboard, StyleSheet, Text, TextInput, View} from 'react-native';
import {libraryResults} from '../library/asResults';
import {getLibrary} from '../library/device';
import type {Library} from '../library/types';
import {Done, failureText, searchNotice, StepFailure} from '../flow/failure';
import {
  insertsContour,
  measureFirstPages,
  MeasuredPages,
  unmeasured,
} from '../flow/measure';
import {afterSearch, runSearch} from '../flow/search';
import {log} from '../log/memory';
import type {SearchOutcome, Source} from '../search/search';
import type {SearchResult} from '../sources/types';
import {Button} from './Button';
import {copy} from './copy';
import {LogView} from './LogView';
import {metrics} from './metrics';
import {ResultsGrid} from './ResultsGrid';
import {Screen} from './Screen';
import {shared} from './styles';
import {ToolBar} from './ToolBar';

type View_ = 'results' | 'library' | 'log';

export type SearchScreenProps = {
  /** The recognized word; empty when the sidebar opened the plugin. */
  initialQuery: string;
  /** Reading the lasso failed: show why, with the field empty and focused. */
  lassoFailure: StepFailure | null;
  /**
   * Inserts the picture, as a contour drawing when its tile shows one (#66); a failure shows its
   * sentence (#37).
   */
  onPick: (
    result: SearchResult,
    query: string,
    contour?: boolean,
  ) => Promise<Done<unknown>>;
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
  // A failed lasso opens on the empty results, not on the Library with its own instruction (#50).
  const [view, setView] = useState<View_>(
    initialQuery || lassoFailure ? 'results' : 'library',
  );
  const [status, setStatus] = useState<string | null>(
    lassoFailure ? failureText(lassoFailure) : null,
  );
  const [library, setLibrary] = useState<Library | null>(null);
  const [thumbDir, setThumbDir] = useState<string | null>(null);
  // The shown results' measures and contour thumbnails (#66).
  const [measured, setMeasured] = useState<MeasuredPages>(() => unmeasured([]));
  // One list per set of items: a new array on each render sent a Library page back to page 1
  // (#46); a new recent search keeps the items, so it keeps the page.
  const libraryItems = library?.items;
  const libraryList = useMemo(
    () => (libraryItems ? libraryResults(libraryItems) : []),
    [libraryItems],
  );
  // One insert at a time: a second tap during a slow e-ink refresh would add a second picture.
  const inserting = useRef(false);
  // The newest search wins: an older one that ends later is ignored (#33).
  const latestSearch = useRef(0);

  useEffect(() => {
    getLibrary().then(setLibrary);
  }, []);

  const pick = async (result: SearchResult) => {
    if (inserting.current) {
      log(`picked ${result.id} while an insert runs: ignored`);
      return;
    }
    inserting.current = true;
    setStatus(copy['insert.running']);
    const inserted = await onPick(
      result,
      query.trim(),
      insertsContour(measured, result.id),
    );
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
        setStatus(copy['search.needWord']);
        return;
      }
      setQuery(word);
      // The keyboard covered half of the results on build 0.1.0 (12) (#42).
      Keyboard.dismiss();
      setView('results');
      setStatus(null);
      const ticket = ++latestSearch.current;
      setSearching(true);
      const run = await runSearch(
        word,
        sources,
        () => ticket === latestSearch.current,
      );
      setThumbDir(run.thumbDir);
      if (!run.outcome) {
        return;
      }
      // Pages 1 and 2 re-sorted by their pixels before page 1 shows (#66).
      const pages = await measureFirstPages(
        run.outcome.results,
        run.thumbDir,
        word,
      );
      if (ticket !== latestSearch.current) {
        return;
      }
      setMeasured(pages);
      setOutcome({...run.outcome, results: pages.results});
      setSearching(false);
      const next = await afterSearch(word, run.outcome);
      if (next && 'offline' in next) {
        setStatus(next.offline);
        setView('library');
      } else if (next) {
        setLibrary(next.library);
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

  // The one status line: a set message first, then what the results view lacks (#50).
  const noSearch = view === 'results' && !searching && !outcome;
  const sourceDownNote =
    view === 'results' &&
    !searching &&
    outcome?.sourceDown === true &&
    outcome.results.length > 0;
  const line =
    status ??
    (noSearch
      ? copy['search.needWord']
      : sourceDownNote
      ? copy['error.sourceDown']
      : '');

  return (
    <Screen>
      <ToolBar
        logShown={view === 'log'}
        onLog={() => toggle('log')}
        onClose={onClose}>
        <TextInput
          testID="query"
          style={[shared.outline, shared.text, styles.input]}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => search(query)}
          placeholder={copy['search.placeholder']}
          accessibilityLabel={copy['search.placeholder']}
          autoFocus={lassoFailure !== null}
          returnKeyType="search"
          placeholderTextColor={metrics.placeholder}
          selectionColor={metrics.selection}
          cursorColor={metrics.ink}
        />
        <Button
          label={copy['action.search']}
          primary
          onPress={() => search(query)}
        />
        <Button
          label={copy['tab.library']}
          selected={view === 'library'}
          onPress={() => toggle('library')}
        />
      </ToolBar>
      <Text
        testID="status"
        style={[shared.text, styles.status]}
        accessibilityLiveRegion="polite">
        {line}
      </Text>
      {view === 'log' && <LogView />}
      {view === 'library' && (
        <View style={styles.fill}>
          {library && library.recentSearches.length > 0 && (
            <View style={[shared.row, styles.recent]}>
              <Text style={shared.text}>{copy['search.recent']}</Text>
              {library.recentSearches.map(word => (
                <Button key={word} label={word} onPress={() => search(word)} />
              ))}
            </View>
          )}
          <ResultsGrid
            results={libraryList}
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
          contourThumbs={measured.contourThumbs}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    flex: 1,
    minHeight: metrics.controlHeight,
    paddingHorizontal: metrics.controlPadding,
  },
  // Two lines reserved: the longest failure sentences wrap once on the Manta.
  status: {
    lineHeight: metrics.bodyLineHeight,
    minHeight: metrics.bodyLineHeight * 2,
  },
  fill: {flex: 1, gap: metrics.sectionGap},
  recent: {flexWrap: 'wrap'},
});
