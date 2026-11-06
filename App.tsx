/**
 * The plugin view: a button press checks the permissions (onboarding, #18), then opens the
 * search; the lasso button first turns the lassoed word into the query (#13). A tap on a result
 * inserts it (#12). Every step is logged; the log shows only behind the Log button (#36).
 *
 * @format
 */

import React, {useEffect, useRef, useState} from 'react';
import {atStep, StepFailure} from './src/flow/failure';
import {insertPicture} from './src/flow/insertPicture';
import {readLassoQuery} from './src/flow/lassoQuery';
import {
  initialOpening,
  isCurrent,
  OpenedLasso,
  OpeningEvent,
  OpeningState,
  step,
  undecided,
} from './src/flow/opening';
import type {LassoPlace} from './src/flow/place';
import {sessionPaths} from './src/flow/session';
import {startSession} from './src/log/file';
import {LASSO_BUTTON_ID, SIDEBAR_BUTTON_ID} from './src/buttons';
import {log, logged} from './src/log/memory';
import {missingPermissions, PermissionNeed} from './src/onboarding/permissions';
import {getLassoElements} from './src/sdk/lasso';
import {onButtonEvent, onLifecycle, takePendingButton} from './src/sdk/buttons';
import {closePluginView} from './src/sdk/plugin';
import type {SearchResult} from './src/sources/types';
import {Onboarding} from './src/ui/Onboarding';
import {SearchScreen} from './src/ui/SearchScreen';
import {StatusScreen} from './src/ui/StatusScreen';
import {copy} from './src/ui/copy';

type Screen =
  | {name: 'starting'}
  | {name: 'failed'}
  | {
      name: 'onboarding';
      buttonId: number;
      missing: PermissionNeed[];
      flow: number;
    }
  | {
      name: 'search';
      query: string;
      lassoFailure: StepFailure | null;
      opened: number;
      flow: number;
    };

function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>({name: 'starting'});
  // The opening controller's state (#44); `dispatch` performs its actions.
  const opening = useRef<OpeningState>(initialOpening);
  // Where the lasso was when the view opened; the picture goes there (#20).
  const place = useRef<LassoPlace | null>(null);

  /** Sets a screen for a flow, unless a newer opening or a close made the flow stale. */
  const show = (flow: number, next: Screen): boolean => {
    if (!isCurrent(opening.current, flow)) {
      log(`flow ${flow} is stale: its screen is dropped`);
      return false;
    }
    setScreen(next);
    return true;
  };

  /** Reads the lasso when the lasso button opened the view; permissions are checked by now. */
  const openSearch = async (
    buttonId: number,
    flow: number,
    lasso: OpenedLasso,
  ) => {
    if (buttonId !== LASSO_BUTTON_ID) {
      if (
        show(flow, {
          name: 'search',
          query: '',
          lassoFailure: null,
          opened: Date.now(),
          flow,
        })
      ) {
        place.current = null;
      }
      return;
    }
    const query = await readLassoQuery(lasso);
    if (!query.ok) {
      log(`recognition failed: ${query.code} ${query.message}`);
    }
    if (
      show(flow, {
        name: 'search',
        query: query.ok ? query.value.query : '',
        lassoFailure: query.ok ? null : atStep('lasso', query),
        opened: Date.now(),
        flow,
      })
    ) {
      place.current = query.ok ? query.value.place : null;
    }
  };

  const startFlow = async (
    buttonId: number,
    flow: number,
    lasso: OpenedLasso,
  ) => {
    show(flow, {name: 'starting'});
    // Paths and the session log file first (#21); a failure is logged and the view goes on.
    await sessionPaths();
    await startSession();
    if (!isCurrent(opening.current, flow)) {
      return;
    }
    const missing = await missingPermissions();
    if (missing.length > 0) {
      log('onboarding: a permission is missing');
      show(flow, {name: 'onboarding', buttonId, missing, flow});
      return;
    }
    if (isCurrent(opening.current, flow)) {
      await openSearch(buttonId, flow, lasso);
    }
  };

  const run = async (buttonId: number, flow: number, lasso: OpenedLasso) => {
    try {
      await startFlow(buttonId, flow, lasso);
    } catch (error) {
      // A rejected promise is not an uncaught error: report it the same way (#13).
      log(`start failed: ${String(error)}`);
      // Never «Starting…» for good: one sentence and Close (review before build 0.1.0 (11)).
      show(flow, {name: 'failed'});
    } finally {
      dispatch({type: 'finished', flow});
    }
  };

  /**
   * Decides without the button event and without a timer: build 0.1.0 (8) stayed at lifecycle 1
   * with no press and no timer firing. A lasso selection means the lasso button (#13); its
   * elements go on to the recognition, so the opening reads them once (#44).
   */
  const decide = async () => {
    const lasso = await logged('getLassoElements', getLassoElements);
    const elements =
      lasso.ok && lasso.value.length > 0 ? lasso.value : undefined;
    dispatch({
      type: 'decided',
      id: elements ? LASSO_BUTTON_ID : SIDEBAR_BUTTON_ID,
      lasso: elements,
      now: Date.now(),
    });
  };

  const dispatch = (event: OpeningEvent) => {
    const next = step(opening.current, event);
    opening.current = next.state;
    for (const action of next.actions) {
      switch (action.type) {
        case 'log':
          log(action.text);
          break;
        case 'start':
          run(action.id, action.flow, action.lasso);
          break;
        case 'decide':
          decide();
          break;
        case 'reset':
          setScreen({name: 'starting'});
          break;
      }
    }
  };

  useEffect(() => {
    // No startLog here: index.js logged the registrations before the view mounted.
    log('view mounted');
    // 1. A press that arrived before the view mounted (gorlix pattern 5).
    const early = takePendingButton();
    if (early !== null) {
      dispatch({type: 'press', id: early, how: 'pending', now: Date.now()});
    }
    // 2. Presses while the view is mounted.
    const stopPresses = onButtonEvent(({id}) => {
      takePendingButton();
      dispatch({type: 'press', id, how: 'live', now: Date.now()});
    });
    // 3. Closed: the next opening starts fresh; opened again: decide again, unless pressed.
    const stopLife = onLifecycle(state => dispatch({type: 'lifecycle', state}));
    // 4. Now, on mount, unless a press already chose.
    if (undecided(opening.current)) {
      decide();
    }
    return () => {
      stopPresses();
      stopLife();
    };
    // Registered once for the life of the view; the controller holds the state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** An insert that ends after a close or a newer opening never closes the newer view (#44). */
  const pick = async (result: SearchResult, query: string, flow: number) => {
    log(`picked ${result.id}`);
    const inserted = await insertPicture(result, query, place.current);
    if (inserted.ok && isCurrent(opening.current, flow)) {
      await logged('closePluginView', closePluginView);
    }
    return inserted;
  };

  switch (screen.name) {
    case 'onboarding':
      return (
        <Onboarding
          missing={screen.missing}
          onDone={() => openSearch(screen.buttonId, screen.flow, undefined)}
          onClose={() => closePluginView()}
        />
      );
    case 'search':
      return (
        <SearchScreen
          key={screen.opened}
          initialQuery={screen.query}
          lassoFailure={screen.lassoFailure}
          onPick={(result, query) => pick(result, query, screen.flow)}
          onClose={() => closePluginView()}
        />
      );
    case 'failed':
      return (
        <StatusScreen
          text={copy['error.unexpected']}
          onClose={() => closePluginView()}
        />
      );
    default:
      return (
        <StatusScreen
          text={copy['app.starting']}
          onClose={() => closePluginView()}
        />
      );
  }
}

export default App;
