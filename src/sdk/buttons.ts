import {PluginManager} from 'sn-plugin-lib';
import {attempt, attemptNow, fail, ok, Result, THROWN_CODE} from './result';

/** Must run at startup (brief section 4.1); async in sn-plugin-lib 0.2.3, so a rejection is a Failure (#95). */
export function initPlugin(): Promise<Result<true>> {
  return attempt(
    () => PluginManager.init(),
    () => ok(true),
  );
}

/** Registers one plugin button; a `false` answer from the host is a failure. */
export function registerButton(
  type: number,
  appTypes: string[],
  config: object,
): Promise<Result<true>> {
  return attempt(
    () => PluginManager.registerButton(type, appTypes, config),
    raw =>
      raw === true
        ? ok(true)
        : fail(THROWN_CODE, `registerButton answered ${String(raw)}`),
  );
}

export type ButtonPress = {id: number};

/**
 * The button event can arrive before the view's listener exists (gorlix gotcha 11, builds
 * 0.1.0 (1), (4) and (6) stayed on their waiting text). index.js listens at startup, as the
 * official docs advise; the latest press waits here until the view takes it.
 */
let pending: number | null = null;
const pressListeners = new Set<(press: ButtonPress) => void>();

/** Keeps the press for the view: pending until it mounts, live while it is mounted. */
export function queuePress(id: number): void {
  pending = id;
  pressListeners.forEach(listener => listener({id}));
}

/**
 * Listens at startup. A press `headless` answers true for runs with no view (showType 0, #74)
 * and never reaches the view; every other press is queued for it.
 */
export function startButtonQueue(
  headless: (id: number) => boolean = () => false,
): Result<true> {
  return attemptNow(() =>
    PluginManager.registerButtonListener({
      onButtonPress: event => {
        if (!headless(event.id)) {
          queuePress(event.id);
        }
      },
    }),
  );
}

/** The press that arrived before the view listened, once; null when there is none. */
export function takePendingButton(): number | null {
  const id = pending;
  pending = null;
  return id;
}

/** Presses while the view is mounted; returns the function that stops listening. */
export function onButtonEvent(
  listener: (press: ButtonPress) => void,
): () => void {
  pressListeners.add(listener);
  return () => pressListeners.delete(listener);
}

/** Lifecycle states from the official docs: 2 the view is shown, 3 it is closed. */
const LIFE_START = 2;
const LIFE_STOP = 3;
export const LifeState = {start: LIFE_START, stop: LIFE_STOP} as const;

export function onLifecycle(listener: (state: number) => void): () => void {
  const subscription = PluginManager.registerPluginLifeListener({
    onMsg: (msg: {state?: number}) => listener(Number(msg?.state)),
  });
  return () => subscription.remove();
}

/**
 * The plugin's own Settings entry, Settings > Apps > Plugins > Ink2Pic (#68; official docs,
 * «registerConfigButton»). A `false` answer from the host is a failure.
 */
export function registerConfigButton(): Promise<Result<true>> {
  return attempt(
    () => PluginManager.registerConfigButton(),
    raw =>
      raw === true
        ? ok(true)
        : fail(THROWN_CODE, `registerConfigButton answered ${String(raw)}`),
  );
}

/**
 * A config click, kept like a button press until the view takes it: the host keeps the last
 * config event only 1000 ms (docs/research/2026-11-pluginhost-sdk.md), and the view may not exist
 * yet when it comes.
 */
let configPending = false;
const configListeners = new Set<() => void>();

/** Listens at startup; `onClick` also runs for every click, after the click is queued. */
export function startConfigQueue(onClick: () => void = () => {}): Result<true> {
  return attemptNow(() =>
    PluginManager.registerConfigButtonListener({
      onClick: () => {
        configPending = true;
        configListeners.forEach(listener => listener());
        onClick();
      },
    }),
  );
}

/** True once when a config click arrived before the view listened. */
export function takePendingConfig(): boolean {
  const pendingClick = configPending;
  configPending = false;
  return pendingClick;
}

/** Config clicks while the view is mounted; returns the function that stops listening. */
export function onConfigClick(listener: () => void): () => void {
  configListeners.add(listener);
  return () => configListeners.delete(listener);
}

/**
 * The system language, from the last `plugin_event_lang` message: sn-plugin-lib 0.2.3 has no
 * getter, only `registerLangListener`, and whether the host sends one at start is TO TEST, so
 * null until one comes. The message's shape is TO TEST too: a string, or `lang`, `language` or
 * `data` of an object.
 */
let lastLanguage: string | null = null;

function languageOf(msg: unknown): string | null {
  if (typeof msg === 'string') {
    return msg || null;
  }
  if (msg && typeof msg === 'object') {
    const fields = msg as Record<string, unknown>;
    for (const key of ['lang', 'language', 'data']) {
      const value = languageOf(fields[key]);
      if (value) {
        return value;
      }
    }
  }
  return null;
}

export function startLangListener(
  onLanguage: (raw: unknown) => void = () => {},
): Result<true> {
  return attemptNow(() =>
    PluginManager.registerLangListener({
      onMsg: (msg: unknown) => {
        lastLanguage = languageOf(msg) ?? lastLanguage;
        onLanguage(msg);
      },
    }),
  );
}

/** The last system language the host sent, or null. */
export function systemLanguage(): string | null {
  return lastLanguage;
}
