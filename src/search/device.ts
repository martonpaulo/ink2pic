/**
 * Search through the on-disk cache (#16, brief section 8.5): a repeated search opens at once and
 * works offline. The cache lives in the private plugin folder; a cache problem is logged and the
 * search goes on, without waiting for the cache write.
 */
import {log} from '../log/memory';
import {pluginFolder} from '../storage/session';
import {deviceStorage} from '../storage/text';
import {cachedSearch} from './cache';
import {SearchOutcome, searchAll, Source} from './search';

export async function searchCached(
  query: string,
  sources: readonly Source[],
): Promise<SearchOutcome> {
  const run = (q: string) => searchAll(q, sources);
  const dir = await pluginFolder();
  if (!dir.ok) {
    log(`search cache: no plugin folder: ${dir.message}`);
    return run(query);
  }
  const cached = await cachedSearch(
    query,
    run,
    deviceStorage,
    `${dir.value}/search-cache.json`,
    Date.now(),
  );
  if (cached.problem) {
    log(`search cache: ${cached.problem}`);
  }
  // Not awaited: the results show while the file is written (#46).
  cached.saved?.then(problem => {
    if (problem) {
      log(`search cache: ${problem}`);
    }
  });
  log(`search cache: ${cached.fromCache ? 'hit' : 'miss'}`);
  return cached.outcome;
}
