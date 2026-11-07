/**
 * «Insert picture» with no plugin view (#74, owner on build 15): the button is registered with
 * showType 0, so the person stays on the note while the lassoed word is read and the best picture
 * inserted. Each step goes to the log. A failure opens the view with its one sentence, through
 * showPluginView (official docs); a missing permission opens the view's onboarding, which then
 * runs the insert as before. Whether the host delivers a showType 0 press and runs the SDK calls
 * with no view is TO TEST on the device (brief section 10.5).
 */
import {log, logged} from '../log/memory';
import {missingPermissions} from '../onboarding/permissions';
import {queuePress} from '../sdk/buttons';
import {showPluginView} from '../sdk/plugin';
import {startSession} from '../storage/logFile';
import {pluginFolder} from '../storage/session';
import {INSERT_BUTTON_ID} from '../buttons';
import {atStep, failureText} from './failure';
import {readLassoQuery} from './lassoQuery';
import {insertBest} from './quickInsert';
import {copy} from '../ui/copy';

export type HeadlessDeps = {
  session: typeof startSession;
  folder: typeof pluginFolder;
  missing: typeof missingPermissions;
  read: typeof readLassoQuery;
  insert: typeof insertBest;
  show: typeof showPluginView;
  /** Hands a press to the view, as if the host had opened it for that button. */
  press: typeof queuePress;
};

const DEVICE: HeadlessDeps = {
  session: startSession,
  folder: pluginFolder,
  missing: missingPermissions,
  read: readLassoQuery,
  insert: insertBest,
  show: showPluginView,
  press: queuePress,
};

/** The failure sentence the view shows once it opens; taken once. */
let note: string | null = null;
const noteListeners = new Set<() => void>();
let running = false;

/** The sentence of the last failed headless insert, once; null when there is none. */
export function takeHeadlessNote(): string | null {
  const text = note;
  note = null;
  return text;
}

/** Calls `listener` when a failed headless insert leaves a sentence; returns the stop function. */
export function onHeadlessNote(listener: () => void): () => void {
  noteListeners.add(listener);
  return () => noteListeners.delete(listener);
}

async function showFailure(text: string, deps: HeadlessDeps): Promise<void> {
  log(`insert picture (no view) failed: ${text}`);
  note = text;
  noteListeners.forEach(listener => listener());
  await logged('showPluginView', deps.show);
}

/** Runs one «Insert picture» press with no view. Never rejects; a second press waits its turn. */
export async function insertWithoutView(
  deps: HeadlessDeps = DEVICE,
): Promise<void> {
  if (running) {
    log('insert picture (no view): already running, press ignored');
    return;
  }
  running = true;
  try {
    await deps.session();
    log('insert picture (no view): start');
    await deps.folder();
    if ((await deps.missing()).length > 0) {
      log(
        'insert picture (no view): a permission is missing, opening the view',
      );
      deps.press(INSERT_BUTTON_ID);
      await logged('showPluginView', deps.show);
      return;
    }
    const query = await deps.read();
    if (!query.ok) {
      log(`insert picture (no view): no word, ${query.code} ${query.message}`);
      await showFailure(failureText(atStep('lasso', query)), deps);
      return;
    }
    log(`insert picture (no view): "${query.value.query}"`);
    const inserted = await deps.insert(query.value.query, query.value.place);
    if (!inserted.ok) {
      await showFailure(inserted.text, deps);
      return;
    }
    log(`insert picture (no view): done, ${inserted.value}`);
  } catch (error) {
    log(`insert picture (no view) failed: ${String(error)}`);
    await showFailure(copy['error.unexpected'], deps);
  } finally {
    running = false;
  }
}
