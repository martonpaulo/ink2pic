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
  createBreaker,
  createContext,
  DEFAULT_ADAPTERS,
  FetchLike,
  SearchOutcome,
  searchAll,
  SourceAdapter,
  SourceContext,
} from '../search-core';
import {pluginFolder} from '../storage/session';
import {getSettings} from '../storage/settings';
import {deviceStorage} from '../storage/text';

/** In memory for the plugin's run: a source that keeps failing is skipped for a while (#65). */
const breaker = createBreaker();

/** The search context on the device, with the person's query languages (#68). */
export function deviceContext(
  languages: readonly string[],
  fetch: FetchLike = globalThis.fetch,
): SourceContext {
  return createContext({fetch, userAgent: USER_AGENT, log, languages});
}

export async function searchCached(
  query: string,
  sources: readonly SourceAdapter[] = DEFAULT_ADAPTERS,
  context?: SourceContext,
  {exact = false}: {exact?: boolean} = {},
): Promise<SearchOutcome> {
  const ctx = context ?? deviceContext((await getSettings()).languages);
  const run = (q: string) =>
    searchAll(q, sources, {ctx, correct: !exact, breaker});
  if (exact) {
    // The cached answer may be the corrected one: the person asked for the word as typed.
    return run(query);
  }
  const dir = await pluginFolder();
  if (!dir.ok) {
    log(`search cache: no plugin folder: ${dir.message}`);
    return run(query);
  }
  const cached = await cachedSearch(query, run, {
    storage: deviceStorage,
    path: `${dir.value}/search-cache.json`,
    // Another language order looks the word up elsewhere: a new search, not the cached one.
    variant: ctx.languages.join(','),
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
  log(
    `search cache: ${
      {
        fresh: 'hit',
        live: 'miss',
        stale: 'every source failed; showing an expired answer',
      }[cached.freshness]
    }`,
  );
  return cached.outcome;
}
