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
import type {LassoPlace} from './src/flow/place';
import {sessionPaths} from './src/flow/session';
import {rotateLogFile} from './src/log/file';
import {LASSO_BUTTON_ID, SIDEBAR_BUTTON_ID} from './src/buttons';
import {log, logged} from './src/log/memory';
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

type Screen =
  | {name: 'starting'}
  | {name: 'onboarding'; buttonId: number}
  | {name: 'search'; query: string; recognitionFailed: boolean; opened: number};

function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>({name: 'starting'});
  const pressed = useRef(false);
  // Where the lasso was when the view opened; the picture goes there (#20).
  const place = useRef<LassoPlace | null>(null);

  /** Reads the lasso when the lasso button opened the view; permissions are checked by now. */
  const openSearch = async (buttonId: number) => {
    place.current = null;
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
    if (query.ok) {
      place.current = query.value.place;
    } else {
      log(`recognition failed: ${query.code} ${query.message}`);
    }
    setScreen({
      name: 'search',
      query: query.ok ? query.value.query : '',
      recognitionFailed: !query.ok,
      opened: Date.now(),
    });
  };

  // One flow at a time; a flow from before the last close is dropped (#33).
  const running = useRef(false);
  const generation = useRef(0);

  const start = async (buttonId: number) => {
    if (running.current) {
      log(`button ${buttonId} while a start runs: ignored`);
      return;
    }
    running.current = true;
    const mine = generation.current;
    try {
      await startFlow(buttonId, mine);
    } catch (error) {
      // A rejected promise is not an uncaught error: report it the same way (#13).
      log(`start failed: ${String(error)}`);
      setScreen({name: 'starting'});
    } finally {
      running.current = false;
    }
  };

  const startFlow = async (buttonId: number, mine: number) => {
    setScreen({name: 'starting'});
    // Paths and the session log file first (#21); a failure is logged and the view goes on.
    await sessionPaths();
    await rotateLogFile();
    if (mine !== generation.current) {
      return;
    }
    if (await needsOnboarding()) {
      log('onboarding: a permission is missing');
      setScreen({name: 'onboarding', buttonId});
      return;
    }
    await openSearch(buttonId);
  };

  useEffect(() => {
    // No startLog here: index.js logged the registrations before the view mounted.
    log('view mounted');
    // The press this opening is for; a live event with another id still restarts the flow.
    let chosen: number | null = null;
    const handle = (id: number, how: string) => {
      if (pressed.current && chosen === id) {
        log(`button ${id} (${how}) already handled`);
        return;
      }
      pressed.current = true;
      chosen = id;
      log(`button ${id} (${how})`);
      start(id);
    };
    /**
     * Decides without the button event and without a timer: build 0.1.0 (8) stayed at lifecycle 1
     * with no press and no timer firing. A lasso selection means the lasso button (#13).
     */
    const decide = async () => {
      if (pressed.current) {
        return;
      }
      const lasso = await logged('getLassoElements', getLassoElements);
      if (pressed.current) {
        return;
      }
      handle(
        lasso.ok && lasso.value.length > 0
          ? LASSO_BUTTON_ID
          : SIDEBAR_BUTTON_ID,
        'decided on open',
      );
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
    // 3. Closed: the next opening starts fresh (pattern 9); opened again: decide again.
    const stopLife = onLifecycle(state => {
      log(`lifecycle ${state}`);
      if (state === LifeState.stop) {
        pressed.current = false;
        chosen = null;
        generation.current += 1;
        setScreen({name: 'starting'});
      } else if (state === LifeState.start) {
        decide();
      }
    });
    // 4. Now, on mount.
    decide();
    return () => {
      stopPresses();
      stopLife();
    };
    // Registered once for the life of the view; start only sets state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = async (result: SearchResult, query: string) => {
    log(`picked ${result.id}`);
    const inserted = await insertPicture(result, query, place.current);
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
