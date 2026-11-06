/**
 * The search core bound to the device (#16, brief section 8.5): the platform's fetch with the
 * plugin's User-Agent, the run log, and the on-disk cache in the private plugin folder, so a
 * repeated search opens at once and works offline. A cache problem is logged and the search goes
 * on, without waiting for the cache write.
 */
import {USER_AGENT} from '../config';
import {log} from '../log/memory';
import {
  cachedSearch,
  createContext,
  DEFAULT_ADAPTERS,
  FetchLike,
  SearchOutcome,
  searchAll,
  SourceAdapter,
  SourceContext,
} from '../search-core';
import {pluginFolder} from '../storage/session';
import {deviceStorage} from '../storage/text';

export function deviceContext(
  fetch: FetchLike = globalThis.fetch,
): SourceContext {
  return createContext({fetch, userAgent: USER_AGENT, log});
}

export async function searchCached(
  query: string,
  sources: readonly SourceAdapter[] = DEFAULT_ADAPTERS,
  ctx: SourceContext = deviceContext(),
): Promise<SearchOutcome> {
  const run = (q: string) => searchAll(q, sources, {ctx});
  const dir = await pluginFolder();
  if (!dir.ok) {
    log(`search cache: no plugin folder: ${dir.message}`);
    return run(query);
  }
  const cached = await cachedSearch(query, run, {
    storage: deviceStorage,
    path: `${dir.value}/search-cache.json`,
  });
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
