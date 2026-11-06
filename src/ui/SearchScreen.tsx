/**
 * Search: the recognized word in an editable field, already submitted, and the results grid
 * (brief section 8.2). Inserting the chosen picture is #14.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {log} from '../log/memory';
import {probeWrite} from '../spike/probes';
import {SearchOutcome, searchAll, Source} from '../search/search';
import {defaultSources} from '../search/sources';
import type {Result} from '../sdk/result';
import type {SearchResult} from '../sources/types';
import {copy} from './copy';
import {metrics} from './metrics';
import {LogView} from './LogView';
import {ResultsGrid} from './ResultsGrid';

export type SearchScreenProps = {
  /** The recognized word; empty when the sidebar opened the plugin. */
  initialQuery: string;
  /** Recognition failed: show why, with the field empty and focused. */
  recognitionFailed: boolean;
  /** Inserts the picture; a failure is shown with the log. */
  onPick: (result: SearchResult) => Promise<Result<unknown>>;
  onClose: () => void;
  sources?: Source[];
};

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
  const [showLog, setShowLog] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

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
    const inserted = await onPick(result);
    if (inserted.ok) {
      setStatus(null);
      return;
    }
    setStatus(copy['error.insert']);
    setShowLog(true);
  };

  const search = useCallback(
    async (text: string) => {
      const word = text.trim();
      if (!word) {
        return;
      }
      log(`search "${word}"`);
      setSearching(true);
      const result = await searchAll(word, sources ?? defaultSources());
      for (const [name, sourceStatus] of Object.entries(result.statuses)) {
        log(`source ${name}: ${JSON.stringify(sourceStatus)}`);
      }
      setOutcome(result);
      setSearching(false);
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
          label={copy['action.log']}
          onPress={() => setShowLog(!showLog)}
        />
        <Button label={copy['action.close']} onPress={onClose} />
      </View>
      {status && <Text style={styles.text}>{status}</Text>}
      {recognitionFailed && (
        <Text style={styles.text}>{copy['error.recognition']}</Text>
      )}
      {showLog ? (
        <View style={styles.logView}>
          <Button label={copy['action.checkFiles']} onPress={checkFiles} />
          <LogView />
        </View>
      ) : (
        (searching || outcome) && (
          <ResultsGrid
            results={outcome?.results ?? []}
            searching={searching}
            sourceDown={outcome?.sourceDown ?? false}
            onPick={pick}
          />
        )
      )}
    </View>
  );
}

function Button({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.button}
      onPress={onPress}>
      <Text style={styles.text}>{label}</Text>
    </Pressable>
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
  button: {
    minHeight: metrics.buttonHeight,
    minWidth: metrics.touchTarget,
    paddingHorizontal: metrics.gap,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: metrics.border,
    borderColor: metrics.ink,
  },
  text: {fontSize: metrics.bodyFont, color: metrics.ink},
  logView: {gap: metrics.gap, alignItems: 'flex-start'},
});
