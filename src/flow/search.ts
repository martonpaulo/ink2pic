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
};

export async function runSearch(
  word: string,
  sources: readonly SourceAdapter[] = DEFAULT_ADAPTERS,
  isNewest: () => boolean = () => true,
  {exact = false}: SearchRunOptions = {},
): Promise<SearchRun> {
  log(`search "${word}"${exact ? ' exactly' : ''}`);
  // The stored thumbnails are listed while the search runs, so the grid knows them at once.
  const [outcome, thumbDir] = await Promise.all([
    searchCached(word, sources, undefined, {exact}),
    prepareThumbs(),
  ]);
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
