/**
 * Search through the on-disk cache (#16, brief section 8.5): a repeated search opens at once and
 * works offline. The cache lives in the private plugin folder; a cache problem is logged and the
 * search goes on, without waiting for the cache write.
 */
import {sessionPaths} from '../flow/session';
import {deviceStorage} from '../library/device';
import {log} from '../log/memory';
import {cachedSearch} from './cache';
import {SearchOutcome, searchAll, Source} from './search';

export async function searchCached(
  query: string,
  sources: readonly Source[],
): Promise<SearchOutcome> {
  const run = (q: string) => searchAll(q, sources);
  const paths = await sessionPaths();
  if (!paths.ok) {
    log(`search cache: no plugin folder: ${paths.message}`);
    return run(query);
  }
  const cached = await cachedSearch(
    query,
    run,
    deviceStorage,
    `${paths.value.pluginDir}/search-cache.json`,
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
