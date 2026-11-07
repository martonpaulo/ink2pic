/**
 * «Insert picture» (#74): the same search as Find picture, then the first picture of page 1,
 * inserted at once at the lasso and left lassoed (#73), with no grid. A failure is the sentence
 * the grid would show: the search state's, or the failed insert's; Find picture still opens the
 * grid to pick another.
 */
import {log} from '../log/memory';
import {searchState} from '../search-core';
import {failureText, offlineText} from './failure';
import {insertPicture} from './insertPicture';
import {measureFirstPages} from './measure';
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
};

const DEVICE: QuickInsertDeps = {
  search: runSearch,
  measure: measureFirstPages,
  insert: insertPicture,
  record: afterSearch,
};

export async function insertBest(
  word: string,
  place: LassoPlace | null,
  deps: QuickInsertDeps = DEVICE,
): Promise<QuickInsert> {
  const run = await deps.search(word);
  // Only a newer search makes it null; this flow runs one search.
  const outcome = run.outcome;
  if (!outcome) {
    return {ok: false, text: copy['error.unexpected']};
  }
  // Page 1 in the grid's order: re-sorted by its pixels, as Find picture shows it (#66).
  const pages = await deps.measure(outcome.results, run.thumbDir, word);
  const best = pages.results[0];
  if (!best) {
    const state = searchState(outcome);
    log(`insert best: no picture for "${word}" (${state.kind})`);
    const text =
      state.kind === 'offline' ? await offlineText() : stateText(state);
    return {ok: false, text: text ?? copy['search.empty']};
  }
  log(`insert best: ${best.id}`);
  // As a contour drawing when its tile shows one, as a tap in the grid does (#66, #72).
  const inserted = await deps.insert(
    best,
    word,
    place,
    pages.contourThumbs.has(best.id),
  );
  if (!inserted.ok) {
    log(
      `insert failed at ${inserted.step}: ${inserted.code} ${inserted.message}`,
    );
    return {ok: false, text: failureText(inserted)};
  }
  // A recent search, as from the grid; after the insert, so the library file is written once at a time.
  await deps.record(word, outcome);
  return inserted;
}
