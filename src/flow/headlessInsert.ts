/**
 * «Insert best picture» with no plugin view (#74, owner on build 15): the button is registered with
 * showType 0, so the person stays on the note while the lassoed word is read and the best picture
 * inserted. Each step goes to the log. A failure opens the view, through showPluginView (official
 * docs), on the search screen with the word and the sentence (#96); a missing permission opens the view's onboarding, which then
 * runs the insert as before. Whether the host delivers a showType 0 press and runs the SDK calls
 * with no view is TO TEST on the device (brief section 10.5).
 *
 * JS timers may stop while no view is open (brief section 3.3, REPORTED), so the flow never waits
 * on one to end (#93): its limit is measured with Date.now() before each step, and a press after
 * that limit starts again instead of waiting for a run that may never end. The lasso place is
 * marked to be read again before the word is deleted or the picture lassoed: the person stays on
 * the note meanwhile.
 */
import {log, logged, timed} from '../log/memory';
import {missingPermissions} from '../onboarding/permissions';
import {queuePress} from '../sdk/buttons';
import {showPluginView} from '../sdk/plugin';
import {startSession} from '../storage/logFile';
import {pluginFolder} from '../storage/session';
import {INSERT_BUTTON_ID} from '../buttons';
import {atStep, failureText, StepFailure} from './failure';
import type {LassoPlace} from './place';
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

/**
 * The longest one press may take, measured with Date.now(): about four source budgets (brief
 * section 8.5) for the search, the thumbnails, the download and the insert.
 */
export const NO_VIEW_LIMIT_MS = 60000;

/**
 * What the view opens on after a failure (#96): the search screen, as Choose picture opens it, with
 * the word, where it was, and the sentence in its status line; a lasso failure shows as Find
 * picture shows one, with an empty field.
 */
export type HeadlessNote = {
  query: string;
  place: LassoPlace | null;
  lassoFailure: StepFailure | null;
  text: string;
};

/** The failure the view shows once it opens; taken once. */
let note: HeadlessNote | null = null;
const noteListeners = new Set<() => void>();
/** When the running press started, or null; a newer press holds `run` (#93). */
let runningSince: number | null = null;
let run = 0;

/** The last failed headless insert, once; null when there is none. */
export function takeHeadlessNote(): HeadlessNote | null {
  const taken = note;
  note = null;
  return taken;
}

/** Calls `listener` when a failed headless insert leaves a sentence; returns the stop function. */
export function onHeadlessNote(listener: () => void): () => void {
  noteListeners.add(listener);
  return () => noteListeners.delete(listener);
}

async function showFailure(
  failed: HeadlessNote,
  deps: HeadlessDeps,
): Promise<void> {
  log(`insert picture (no view) failed: ${failed.text}`);
  note = failed;
  noteListeners.forEach(listener => listener());
  await logged('showPluginView', deps.show);
}

/** Runs one «Insert best picture» press with no view. Never rejects; a second press waits its turn. */
export async function insertWithoutView(
  deps: HeadlessDeps = DEVICE,
): Promise<void> {
  const started = Date.now();
  const age = runningSince === null ? null : started - runningSince;
  if (age !== null && age <= NO_VIEW_LIMIT_MS) {
    log('insert picture (no view): already running, press ignored');
    return;
  }
  runningSince = started;
  const own = ++run;
  const deadline = started + NO_VIEW_LIMIT_MS;
  // The word and its place once read, for the search screen a failure opens (#96).
  let word = '';
  let at: LassoPlace | null = null;
  try {
    await deps.session();
    log('insert picture (no view): start');
    if (age !== null) {
      log(
        `insert picture (no view): the last press is still running after ${age} ms; starting again`,
      );
    }
    await deps.folder();
    if ((await deps.missing()).length > 0) {
      log(
        'insert picture (no view): a permission is missing, opening the view',
      );
      deps.press(INSERT_BUTTON_ID);
      await logged('showPluginView', deps.show);
      return;
    }
    const query = await timed('lasso', () => deps.read());
    if (!query.ok) {
      log(`insert picture (no view): no word, ${query.code} ${query.message}`);
      const lassoFailure = atStep('lasso', query);
      await showFailure(
        {query: '', place: null, lassoFailure, text: failureText(lassoFailure)},
        deps,
      );
      return;
    }
    word = query.value.query;
    log(`insert picture (no view): "${word}"`);
    const {place} = query.value;
    at = place ? {...place, recheck: true} : null;
    const inserted = await deps.insert(word, at, undefined, {deadline});
    if (!inserted.ok) {
      await showFailure(
        {query: word, place: at, lassoFailure: null, text: inserted.text},
        deps,
      );
      return;
    }
    log(`insert picture (no view): done, ${inserted.value}`);
  } catch (error) {
    log(`insert picture (no view) failed: ${String(error)}`);
    await showFailure(
      {
        query: word,
        place: at,
        lassoFailure: null,
        text: copy['error.unexpected'],
      },
      deps,
    );
  } finally {
    if (run === own) {
      runningSince = null;
    }
  }
}
