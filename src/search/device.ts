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
import {Settings, sourceOn, styleFlags} from '../settings/settings';
import {deviceStorage} from '../storage/text';

/** In memory for the plugin's run: a source that keeps failing is skipped for a while (#65). */
const breaker = createBreaker();

/**
 * The search context on the device, with the person's query languages (#68), style and data
 * saver (#70). `noTimerWait` retries a failed request at once, with no timer (#93).
 */
export function deviceContext(
  settings: Settings,
  fetch: FetchLike = globalThis.fetch,
  noTimerWait = false,
): SourceContext {
  return {
    ...createContext({
      fetch,
      userAgent: USER_AGENT,
      log,
      languages: settings.languages,
      ...(noTimerWait ? {retryDelayMs: 0} : {}),
    }),
    photos: styleFlags(settings).photos,
    dataSaver: settings.dataSaver,
  };
}

/**
 * What changes a search's results, for the search cache, read from what the search runs with: an
 * answer found with other languages, sources, style or data saver is another entry (#68, #70). It
 * is derived from the context and the sources asked, never restated from the settings (#99).
 */
export function searchVariant(
  ctx: SourceContext,
  sources: readonly SourceAdapter[],
): string {
  return [
    ctx.languages.join(','),
    `sources:${sources.map(source => source.name).join(',')}`,
    ctx.photos ? 'photos' : '',
    ctx.dataSaver ? 'saver' : '',
  ]
    .filter(Boolean)
    .join('|');
}

export async function searchCached(
  query: string,
  sources: readonly SourceAdapter[] = DEFAULT_ADAPTERS,
  context?: SourceContext,
  {exact = false, noTimerWait = false}: {exact?: boolean; noTimerWait?: boolean} = {},
): Promise<SearchOutcome> {
  const settings = await getSettings();
  const ctx = context ?? deviceContext(settings, undefined, noTimerWait);
  // Only the sources the person left on (#70); one always is.
  const active = sources.filter(source => sourceOn(settings, source.name));
  const run = (q: string) =>
    searchAll(q, active, {ctx, correct: !exact, breaker});
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
    // Other languages, sources or style find other pictures: a new search, not the cached one.
    variant: searchVariant(ctx, active),
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
