/**
 * «Insert picture» (#74): the same search as Find picture, then the first picture of page 1,
 * inserted at once at the lasso and left lassoed (#73), with no grid. A failure is the sentence
 * the grid would show: the search state's, or the failed insert's; Find picture still opens the
 * grid to pick another.
 *
 * Each step logs its time (#88). Once page 1's thumbnails are on the device, the full download
 * of the picture leading the search order starts while they are measured; the winner is still the
 * measured order's first, and the early download is used only when it is that picture.
 *
 * With no view, JS timers may stop (brief section 3.3, REPORTED), so this flow never waits on one
 * to end (#93): the search retries with no pause, and a limit measured with Date.now() is checked
 * before each step. The log shows the time around each wait.
 */
import {log, logTime, timed} from '../log/memory';
import {MEASURED_RESULTS, searchState} from '../search-core';
import {failureText, offlineText} from './failure';
import {
  dropEarly,
  EarlyDownload,
  insertPicture,
  startEarlyDownload,
  Stop,
} from './insertPicture';
import {isContourUri, measureFirstPages} from './measure';
import type {LassoPlace} from './place';
import {afterSearch, runSearch, stateText} from './search';
import {copy} from '../ui/copy';

/** The inserted file, or the one sentence the person reads. */
export type QuickInsert = {ok: true; value: string} | {ok: false; text: string};

export type QuickInsertDeps = {
  search: typeof runSearch;
  measure: typeof measureFirstPages;
  insert: typeof insertPicture;
  record: typeof afterSearch;
  early: typeof startEarlyDownload;
};

const DEVICE: QuickInsertDeps = {
  search: runSearch,
  measure: measureFirstPages,
  insert: insertPicture,
  record: afterSearch,
  early: startEarlyDownload,
};

/**
 * When the flow stops: `deadline`, a Date.now() value the no-view flow gives up at (#93), and
 * `stop`, the view's own reason, such as a Close (#96). Both are checked before each step.
 */
export type InsertLimit = {deadline?: number; stop?: Stop};

const LATE: QuickInsert = {ok: false, text: copy['error.sourcesDown']};

/** One check for the deadline and the caller's reason; null while the flow may go on. */
function stopOf({deadline, stop}: InsertLimit): Stop {
  return () =>
    deadline !== undefined && Date.now() > deadline
      ? 'the limit passed'
      : stop?.() ?? null;
}

/** True, logged, when the flow must stop before `step`. */
function halted(stop: Stop, step: string): boolean {
  const reason = stop();
  if (reason) {
    log(`insert best: ${reason} before ${step}`);
  }
  return reason !== null;
}

export async function insertBest(
  word: string,
  place: LassoPlace | null,
  deps: QuickInsertDeps = DEVICE,
  limit: InsertLimit = {},
): Promise<QuickInsert> {
  const started = Date.now();
  const stop = stopOf(limit);
  if (halted(stop, 'search')) {
    return LATE;
  }
  const run = await timed('search', () =>
    deps.search(word, undefined, undefined, {noTimerWait: true}),
  );
  logTime('search', started, `${run.outcome?.results.length ?? 0} results`);
  // Only a newer search makes it null; this flow runs one search.
  const outcome = run.outcome;
  if (!outcome) {
    return {ok: false, text: copy['error.unexpected']};
  }
  // Page 1 in the grid's order: re-sorted by its pixels, as Find picture shows it (#66).
  const measuring = Date.now();
  const early: {value: EarlyDownload | null} = {value: null};
  const leading = outcome.results[0];
  if (halted(stop, 'thumbnails')) {
    return LATE;
  }
  const pages = await timed('thumbnails', () =>
    deps.measure(outcome.results, run.thumbDir, word, undefined, () => {
      early.value = leading ? deps.early(leading) : null;
    }),
  );
  logTime(
    'thumbnails',
    measuring,
    `${pages.measures.size} of ${Math.min(
      outcome.results.length,
      MEASURED_RESULTS,
    )} measured`,
  );
  const best = pages.results[0];
  if (!best) {
    const state = searchState(outcome);
    log(`insert best: no picture for "${word}" (${state.kind})`);
    const text =
      state.kind === 'offline' ? await offlineText() : stateText(state);
    return {ok: false, text: text ?? copy['search.empty']};
  }
  log(`insert best: ${best.id}`);
  // The early download serves only the picture that won; another one is dropped (#88).
  const usable = early.value?.id === best.id ? early.value : null;
  if (early.value && !usable) {
    log(`early download ${early.value.id} dropped: ${best.id} won`);
    dropEarly(early.value);
  }
  if (halted(stop, 'the insert')) {
    if (usable) {
      dropEarly(usable);
    }
    return LATE;
  }
  // As a contour drawing when its tile shows one, as a tap in the grid does (#66, #72).
  const inserted = await timed('insert', () =>
    deps.insert(
      best,
      word,
      place,
      isContourUri(pages.contourThumbs.get(best.id) ?? ''),
      undefined,
      usable,
      stop,
    ),
  );
  if (!inserted.ok) {
    log(
      `insert failed at ${inserted.step}: ${inserted.code} ${inserted.message}`,
    );
    logTime('total', started, 'failed');
    return {ok: false, text: failureText(inserted)};
  }
  logTime('total', started);
  // A recent search, as from the grid; after the insert, so the library file is written once at a time.
  await deps.record(word, outcome);
  return inserted;
}
