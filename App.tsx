/**
 * The plugin view: a button press checks the permissions (onboarding, #18), then opens the
 * search; the lasso button first turns the lassoed word into the query (#13). A tap on a result
 * inserts it (#12). «Insert picture» inserts the best result with no grid (#74). The plugin's
 * Settings entry opens the Settings screen (#70) and its Languages screen (#68). Every step is logged; the log shows only behind
 * the Log button (#36).
 *
 * @format
 */

import React, {useEffect, useRef, useState} from 'react';
import {atStep, failureText, StepFailure} from './src/flow/failure';
import {insertPicture} from './src/flow/insertPicture';
import {readLassoQuery} from './src/flow/lassoQuery';
import {
  initialOpening,
  isCurrent,
  OpenedLasso,
  OpeningEvent,
  OpeningState,
  step,
} from './src/flow/opening';
import type {LassoPlace} from './src/flow/place';
import {insertBest} from './src/flow/quickInsert';
import {onHeadlessNote, takeHeadlessNote} from './src/flow/headlessInsert';
import {startSession} from './src/storage/logFile';
import {pluginFolder} from './src/storage/session';
import {
  CONFIG_BUTTON_ID,
  INSERT_BUTTON_ID,
  INSERT_NOTE_ID,
  LASSO_BUTTON_ID,
  SIDEBAR_BUTTON_ID,
} from './src/buttons';
import {log, logged} from './src/log/memory';
import {missingPermissions, PermissionNeed} from './src/onboarding/permissions';
import {getLassoElements} from './src/sdk/lasso';
import {
  onButtonEvent,
  onConfigClick,
  onLifecycle,
  systemLanguage,
  takePendingButton,
  takePendingConfig,
} from './src/sdk/buttons';
import {closePluginView} from './src/sdk/plugin';
import type {SearchResult} from './src/search-core';
import {clearLibrary} from './src/library/device';
import {Settings, SettingsAction, settingsStep} from './src/settings/settings';
import {getSettings, saveSettings} from './src/storage/settings';
import {LanguagesScreen} from './src/ui/LanguagesScreen';
import {SettingsScreen} from './src/ui/SettingsScreen';
import {Onboarding} from './src/ui/Onboarding';
import {SearchScreen} from './src/ui/SearchScreen';
import {StatusScreen} from './src/ui/StatusScreen';
import {copy} from './src/ui/copy';

type Screen =
  | {name: 'starting'}
  | {name: 'failed'}
  /** One line: «Adding…» while Insert picture runs, then its failure, if any (#74). */
  | {name: 'note'; text: string}
  /** The plugin's Settings entry, each tap saved at once (#70), and its Languages screen (#68). */
  | {name: 'settings' | 'languages'; settings: Settings}
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
  // The sentence of a failed «Insert picture» that ran with no view (#74).
  const headlessNote = useRef<string | null>(null);
  // The session's settings now: a tap before the e-ink redraw chains from it (#95).
  const settingsNow = useRef<Settings | null>(null);
  // The settings saves, in tap order.
  const saving = useRef<Promise<void>>(Promise.resolve());

  /** Sets a screen for a flow, unless a newer opening or a close made the flow stale. */
  const show = (flow: number, next: Screen): boolean => {
    if (!isCurrent(opening.current, flow)) {
      log(`flow ${flow} is stale: its screen is dropped`);
      return false;
    }
    setScreen(next);
    return true;
  };

  /**
   * Insert picture (#74): the lassoed word, then the best result inserted at once; the view
   * closes after the insert, as after a pick, and shows the sentence when anything fails.
   */
  const insertNow = async (flow: number, lasso: OpenedLasso) => {
    if (!show(flow, {name: 'note', text: copy['insert.running']})) {
      return;
    }
    const query = await readLassoQuery(lasso);
    if (!query.ok) {
      log(`recognition failed: ${query.code} ${query.message}`);
      show(flow, {name: 'note', text: failureText(atStep('lasso', query))});
      return;
    }
    const inserted = await insertBest(query.value.query, query.value.place);
    // A newer opening or a close made this flow stale: never close or change its view (#44).
    if (!isCurrent(opening.current, flow)) {
      log(`flow ${flow} is stale: its insert ends here`);
      return;
    }
    if (inserted.ok) {
      await logged('closePluginView', closePluginView);
      return;
    }
    show(flow, {name: 'note', text: inserted.text});
  };

  /** Reads the lasso when the lasso button opened the view; permissions are checked by now. */
  const openSearch = async (
    buttonId: number,
    flow: number,
    lasso: OpenedLasso,
  ) => {
    if (buttonId === CONFIG_BUTTON_ID) {
      place.current = null;
      const loaded = await getSettings();
      if (show(flow, {name: 'settings', settings: loaded})) {
        settingsNow.current = loaded;
      }
      return;
    }
    if (buttonId === INSERT_BUTTON_ID) {
      place.current = null;
      await insertNow(flow, lasso);
      return;
    }
    if (buttonId === INSERT_NOTE_ID) {
      place.current = null;
      show(flow, {
        name: 'note',
        text: headlessNote.current ?? copy['error.unexpected'],
      });
      return;
    }
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
    // The plugin folder first (#21); a failure is logged and the view goes on.
    await pluginFolder();
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

  /** Runs a flow's host calls with one catch, then tells the controller it ended (#95). */
  const run = async (flow: number, body: () => Promise<void>) => {
    try {
      await body();
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
   * elements go on to the recognition, so the opening reads them once (#44). Without a press,
   * Insert picture and Find picture look the same: the grid opens, where nothing is inserted
   * unasked (#74).
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
          run(action.flow, () =>
            startFlow(action.id, action.flow, action.lasso),
          );
          break;
        case 'resume':
          run(action.flow, () => openSearch(action.id, action.flow, undefined));
          break;
        case 'decide':
          decide();
          break;
        case 'reset':
          setScreen({name: 'starting'});
          break;
        case 'startSession':
          startSession();
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
    // 2b. The plugin's Settings entry, pending or live, as a press of its own id (#68).
    if (takePendingConfig()) {
      dispatch({
        type: 'press',
        id: CONFIG_BUTTON_ID,
        how: 'pending',
        now: Date.now(),
      });
    }
    const stopConfig = onConfigClick(() => {
      takePendingConfig();
      dispatch({
        type: 'press',
        id: CONFIG_BUTTON_ID,
        how: 'live',
        now: Date.now(),
      });
    });
    // 2c. A failed «Insert picture» with no view opened the view for its sentence (#74).
    const noteNow = (how: 'pending' | 'live') => {
      const text = takeHeadlessNote();
      if (text !== null) {
        headlessNote.current = text;
        dispatch({type: 'press', id: INSERT_NOTE_ID, how, now: Date.now()});
      }
    };
    noteNow('pending');
    const stopNote = onHeadlessNote(() => noteNow('live'));
    // 3. Closed: the next opening starts fresh; opened again: decide again, unless pressed.
    const stopLife = onLifecycle(state => dispatch({type: 'lifecycle', state}));
    // 4. Now, on mount, unless a press already chose: the controller starts the session log
    // before the decision's first logged call (#58).
    dispatch({type: 'mount'});
    return () => {
      stopPresses();
      stopConfig();
      stopNote();
      stopLife();
    };
    // Registered once for the life of the view; the controller holds the state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** An insert that ends after a close or a newer opening never closes the newer view (#44). */
  const pick = async (
    result: SearchResult,
    query: string,
    flow: number,
    contour = false,
  ) => {
    log(`picked ${result.id}${contour ? ' (contour)' : ''}`);
    const inserted = await insertPicture(result, query, place.current, contour);
    if (inserted.ok && isCurrent(opening.current, flow)) {
      await logged('closePluginView', closePluginView);
    }
    return inserted;
  };

  /** One tap: the screen redraws once with the new settings, then the file is written (#68, #70). */
  const changeSettings = async (
    name: 'settings' | 'languages',
    current: Settings,
    action: SettingsAction,
  ) => {
    // A reset restores the default of the system language the host sent last.
    const applied: SettingsAction =
      action.type === 'reset'
        ? {type: 'reset', system: systemLanguage()}
        : action;
    const base = settingsNow.current ?? current;
    const next = settingsStep(base, applied);
    if (next === base) {
      return;
    }
    settingsNow.current = next;
    log(`settings: ${JSON.stringify(action)}`);
    setScreen({name, settings: next});
    saving.current = saving.current.then(() => saveSettings(next));
    await saving.current;
  };

  switch (screen.name) {
    case 'settings':
      return (
        <SettingsScreen
          settings={screen.settings}
          onChange={action =>
            changeSettings('settings', screen.settings, action)
          }
          onLanguages={() =>
            setScreen({
              name: 'languages',
              settings: settingsNow.current ?? screen.settings,
            })
          }
          onClear={clearLibrary}
          onClose={() => closePluginView()}
        />
      );
    case 'languages':
      return (
        <LanguagesScreen
          languages={screen.settings.languages}
          onChange={action =>
            changeSettings('languages', screen.settings, {
              type: 'languages',
              action,
            })
          }
          onReset={() =>
            changeSettings('languages', screen.settings, {
              type: 'languages',
              action: {type: 'reset', system: systemLanguage()},
            })
          }
          onBack={() =>
            setScreen({
              name: 'settings',
              settings: settingsNow.current ?? screen.settings,
            })
          }
          onClose={() => closePluginView()}
        />
      );
    case 'onboarding':
      return (
        <Onboarding
          missing={screen.missing}
          onDone={() =>
            dispatch({
              type: 'onboarded',
              id: screen.buttonId,
              flow: screen.flow,
            })
          }
          onClose={() => closePluginView()}
        />
      );
    case 'search':
      return (
        <SearchScreen
          key={screen.opened}
          initialQuery={screen.query}
          lassoFailure={screen.lassoFailure}
          onPick={(result, query, contour) =>
            pick(result, query, screen.flow, contour)
          }
          onClose={() => closePluginView()}
        />
      );
    case 'note':
      return (
        <StatusScreen text={screen.text} onClose={() => closePluginView()} />
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
