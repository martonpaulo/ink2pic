/**
 * One search as the screen runs it: the cached search (#16) and the stored thumbnails (#46) at
 * the same time; only the newest search is shown (#33); after its results show, an offline search
 * opens the Library with its sentence, and any other answer is recorded as a recent search.
 */
import {getLibrary, recordSearch} from '../library/device';
import type {Library} from '../library/types';
import {log} from '../log/memory';
import {
  DEFAULT_ADAPTERS,
  SearchOutcome,
  SearchState,
  SearchStateKind,
  searchState,
  SourceAdapter,
} from '../search-core';
import {searchCached} from '../search/device';
import {prepareThumbs} from '../search/thumbs';
import {markSavedSymbols} from '../symbols/store';
import {copy, CopyKey} from '../ui/copy';
import {offlineText} from './failure';

export type SearchRun = {
  /** Null when a newer search started meanwhile: this answer is ignored. */
  outcome: SearchOutcome | null;
  /** The plugin folder with its thumbnails listed, or null (see `prepareThumbs`). */
  thumbDir: string | null;
};

/** What follows the shown results: the offline sentence, the updated library, or nothing. */
export type AfterSearch = {offline: string} | {library: Library} | null;

export type SearchRunOptions = {
  /** Search the word as typed: no corrected spelling, no cached answer (#65). */
  exact?: boolean;
  /** No wait on a JS timer, for the no-view insert: timers may stop with no view (#93). */
  noTimerWait?: boolean;
};

export async function runSearch(
  word: string,
  sources: readonly SourceAdapter[] = DEFAULT_ADAPTERS,
  isNewest: () => boolean = () => true,
  {exact = false, noTimerWait = false}: SearchRunOptions = {},
): Promise<SearchRun> {
  log(`search "${word}"${exact ? ' exactly' : ''}`);
  // The stored thumbnails are listed while the search runs, so the grid knows them at once.
  const [found, thumbDir] = await Promise.all([
    searchCached(word, sources, undefined, {exact, noTimerWait}),
    prepareThumbs(),
  ]);
  // Saved OpenMoji pictures are marked; with no network, only those show (#91).
  const outcome = await markSavedSymbols(found);
  if (!isNewest()) {
    log(`search "${word}" ended after a newer one: ignored`);
    return {outcome: null, thumbDir};
  }
  for (const [name, status] of Object.entries(outcome.statuses)) {
    log(`source ${name}: ${JSON.stringify(status)}`);
  }
  return {outcome, thumbDir};
}

/** Runs once the results show, so neither the permission check nor the library write delays them. */
export async function afterSearch(
  word: string,
  outcome: SearchOutcome,
): Promise<AfterSearch> {
  const state = searchState(outcome).kind;
  if (state === 'offline') {
    return {offline: await offlineText()};
  }
  if (state === 'failed') {
    return null;
  }
  await recordSearch(word);
  return {library: await getLibrary()};
}

/** The one sentence of each search state; null when the results speak for themselves. */
const STATE_COPY: Record<SearchStateKind, CopyKey | null> = {
  searching: 'search.running',
  ready: null,
  corrected: 'search.corrected',
  stale: 'search.stale',
  partial: 'error.sourceDown',
  empty: 'search.empty',
  offline: 'error.offline',
  failed: 'error.sourcesDown',
};

/** The state's sentence, with the corrected spelling in it; null when there is none. */
export function stateText(state: SearchState): string | null {
  const key = STATE_COPY[state.kind];
  if (!key) {
    return null;
  }
  return state.kind === 'corrected'
    ? copy[key].replace('{query}', state.query)
    : copy[key];
}

/** The action that searches the typed word as it is, after a corrected search. */
export function insteadLabel(word: string): string {
  return copy['search.instead'].replace('{query}', word);
}
