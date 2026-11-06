/**
 * One search as the screen runs it: the cached search (#16) and the stored thumbnails (#46) at
 * the same time; only the newest search is shown (#33); after its results show, an offline search
 * opens the Library with its sentence, and any other answer is recorded as a recent search.
 */
import {getLibrary, recordSearch} from '../library/device';
import type {Library} from '../library/types';
import {log} from '../log/memory';
import {searchCached} from '../search/device';
import type {SearchOutcome, Source} from '../search/search';
import {defaultSources} from '../search/sources';
import {prepareThumbs} from '../search/thumbs';
import {isOffline, offlineText} from './failure';

export type SearchRun = {
  /** Null when a newer search started meanwhile: this answer is ignored. */
  outcome: SearchOutcome | null;
  /** The plugin folder with its thumbnails listed, or null (see `prepareThumbs`). */
  thumbDir: string | null;
};

/** What follows the shown results: the offline sentence, the updated library, or nothing. */
export type AfterSearch = {offline: string} | {library: Library} | null;

export async function runSearch(
  word: string,
  sources: readonly Source[] = defaultSources(),
  isNewest: () => boolean = () => true,
): Promise<SearchRun> {
  log(`search "${word}"`);
  // The stored thumbnails are listed while the search runs, so the grid knows them at once.
  const [outcome, thumbDir] = await Promise.all([
    searchCached(word, sources),
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
  if (isOffline(outcome)) {
    return {offline: await offlineText()};
  }
  if (outcome.allFailed) {
    return null;
  }
  await recordSearch(word);
  return {library: await getLibrary()};
}
