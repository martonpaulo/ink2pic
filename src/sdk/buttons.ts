import {PluginManager} from 'sn-plugin-lib';
import {attempt, fail, ok, Result, THROWN_CODE} from './result';

/** Must run at startup (brief section 4.1). */
export function initPlugin(): Result<true> {
  try {
    PluginManager.init();
    return ok(true);
  } catch (error) {
    return fail(
      THROWN_CODE,
      error instanceof Error ? error.message : String(error),
    );
  }
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

export function startButtonQueue(): void {
  PluginManager.registerButtonListener({
    onButtonPress: event => {
      pending = event.id;
      pressListeners.forEach(listener => listener({id: event.id}));
    },
  });
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
