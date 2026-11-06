/**
 * The plugin view: a button press checks the permissions (onboarding, #18), then opens the
 * search; the lasso button first turns the lassoed word into the query (#13). A tap on a result
 * inserts it (#12). Every step is logged; the starting screen shows the log live.
 *
 * @format
 */

import React, {useEffect, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {insertPicture} from './src/flow/insertPicture';
import {readLassoQuery} from './src/flow/lassoQuery';
import {LASSO_BUTTON_ID, SIDEBAR_BUTTON_ID} from './src/buttons';
import {log, logged, startLog} from './src/log/memory';
import {needsOnboarding} from './src/onboarding/permissions';
import {getLassoElements} from './src/sdk/lasso';
import {
  LifeState,
  onButtonEvent,
  onLifecycle,
  takePendingButton,
} from './src/sdk/buttons';
import {closePluginView} from './src/sdk/plugin';
import type {SearchResult} from './src/sources/types';
import {copy} from './src/ui/copy';
import {LogView} from './src/ui/LogView';
import {metrics} from './src/ui/metrics';
import {Onboarding} from './src/ui/Onboarding';
import {SearchScreen} from './src/ui/SearchScreen';

/**
 * The button event did not always arrive when the view opened (builds 0.1.0 (1) and (6) stayed
 * on the waiting text); after this, the view opens by itself.
 */
const BUTTON_EVENT_WAIT_MS = 2000;

type Screen =
  | {name: 'starting'}
  | {name: 'onboarding'; buttonId: number}
  | {name: 'search'; query: string; recognitionFailed: boolean; opened: number};

function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>({name: 'starting'});
  const pressed = useRef(false);

  /** Reads the lasso when the lasso button opened the view; permissions are checked by now. */
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

  const start = async (buttonId: number) => {
    setScreen({name: 'starting'});
    if (await needsOnboarding()) {
      log('onboarding: a permission is missing');
      setScreen({name: 'onboarding', buttonId});
      return;
    }
    await openSearch(buttonId);
  };

  useEffect(() => {
    startLog();
    log('view mounted');
    const handle = (id: number, how: string) => {
      pressed.current = true;
      startLog();
      log(`button ${id} (${how})`);
      start(id);
    };
    // 1. A press that arrived before the view mounted (gorlix pattern 5).
    const early = takePendingButton();
    if (early !== null) {
      handle(early, 'pending');
    }
    // 2. Presses while the view is mounted.
    const stopPresses = onButtonEvent(({id}) => {
      takePendingButton();
      handle(id, 'live');
    });
    // 3. The view closed: show the starting screen next time, never stale state (pattern 9).
    const stopLife = onLifecycle(state => {
      log(`lifecycle ${state}`);
      if (state === LifeState.stop) {
        pressed.current = false;
        setScreen({name: 'starting'});
      }
    });
    // 4. Last resort: no press at all within the wait.
    const watchdog = setTimeout(async () => {
      if (pressed.current) {
        return;
      }
      log(
        `no button event after ${BUTTON_EVENT_WAIT_MS} ms; checking the lasso`,
      );
      const lasso = await logged('getLassoElements', getLassoElements);
      start(
        lasso.ok && lasso.value.length > 0
          ? LASSO_BUTTON_ID
          : SIDEBAR_BUTTON_ID,
      );
    }, BUTTON_EVENT_WAIT_MS);
    return () => {
      stopPresses();
      stopLife();
      clearTimeout(watchdog);
    };
    // Registered once for the life of the view; start only sets state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = async (result: SearchResult) => {
    log(`picked ${result.id}`);
    const inserted = await insertPicture(result);
    if (inserted.ok) {
      await logged('closePluginView', closePluginView);
    }
    return inserted;
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
          <Text style={styles.text}>{copy['app.starting']}</Text>
          <LogView />
        </View>
      );
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: metrics.paper,
    padding: metrics.gap,
    gap: metrics.gap,
  },
  text: {fontSize: metrics.bodyFont, color: metrics.ink},
});

export default App;
