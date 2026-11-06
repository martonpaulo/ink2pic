/**
 * The plugin view: a button press checks the permissions (onboarding, #18), then opens the
 * search; the lasso button first turns the lassoed word into the query (#13).
 *
 * @format
 */

import React, {useEffect, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {readLassoQuery} from './src/flow/lassoQuery';
import {LASSO_BUTTON_ID} from './src/buttons';
import {log, startLog} from './src/log/memory';
import {needsOnboarding} from './src/onboarding/permissions';
import {closePluginView, onButtonPress} from './src/sdk/plugin';
import type {SearchResult} from './src/sources/types';
import {copy} from './src/ui/copy';
import {metrics} from './src/ui/metrics';
import {Onboarding} from './src/ui/Onboarding';
import {SearchScreen} from './src/ui/SearchScreen';

type Screen =
  | {name: 'starting'}
  | {name: 'onboarding'; buttonId: number}
  | {name: 'search'; query: string; recognitionFailed: boolean; opened: number};

function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>({name: 'starting'});

  /** Reads the lasso when the lasso button opened the view; permissions are granted by now. */
  const openSearch = async (buttonId: number) => {
    if (buttonId !== LASSO_BUTTON_ID) {
      setScreen({
        name: 'search',
        query: '',
        recognitionFailed: false,
        opened: Date.now(),
      });
      return;
    }
    const query = await readLassoQuery();
    if (!query.ok) {
      log(`recognition failed: ${query.code} ${query.message}`);
    }
    setScreen({
      name: 'search',
      query: query.ok ? query.value : '',
      recognitionFailed: !query.ok,
      opened: Date.now(),
    });
  };

  useEffect(() => {
    return onButtonPress(async ({id}) => {
      startLog();
      log(`button ${id}`);
      setScreen({name: 'starting'});
      if (await needsOnboarding()) {
        setScreen({name: 'onboarding', buttonId: id});
        return;
      }
      await openSearch(id);
    });
    // The listener is registered once; openSearch only sets state.
  }, []);

  const pick = (result: SearchResult) => {
    // Inserting the picture is #14; until then the choice is only logged.
    log(`picked ${result.id}`);
  };

  switch (screen.name) {
    case 'onboarding':
      return <Onboarding onDone={() => openSearch(screen.buttonId)} />;
    case 'search':
      return (
        <SearchScreen
          key={screen.opened}
          initialQuery={screen.query}
          recognitionFailed={screen.recognitionFailed}
          onPick={pick}
          onClose={() => closePluginView()}
        />
      );
    default:
      return (
        <View style={styles.screen}>
          <Text style={styles.text}>{copy['search.running']}</Text>
        </View>
      );
  }
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: metrics.paper, padding: metrics.gap},
  text: {fontSize: metrics.bodyFont, color: metrics.ink},
});

export default App;
