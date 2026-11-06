/**
 * Searches every source in parallel; a slow or failing source never blocks the other
 * (brief section 8.5).
 */
import type {SourceAdapter, SourceContext} from './adapter';
import {Clock, noLog, systemClock} from './clock';
import {SOURCE_TIMEOUT_MS} from './fetcher';
import {rankForEink} from './rank';
import type {FailureKind, SearchResult, SourceOutcome} from './types';

export type SourceStatus =
  | {state: 'ok'; count: number}
  | {state: 'empty'}
  | {state: 'failed'; kind: FailureKind; message: string};

export type SearchOutcome = {
  results: SearchResult[];
  statuses: Record<string, SourceStatus>;
  /** Some source failed and another answered, with or without results: show the note. */
  sourceDown: boolean;
  /** Every source failed: nothing to show but the failure. */
  allFailed: boolean;
  /**
   * The spelling a source suggested, when the query found nothing and the suggestion did: the
   * results are the suggestion's (#65). The query itself stays what the person typed.
   */
  correctedQuery?: string;
};

export type SearchOptions = {
  ctx?: SourceContext;
  clock?: Clock;
  /** Per request; a source of `requests` requests gets that many times this. */
  timeoutMs?: number;
  /** False searches exactly the query: no corrected search («Search for X instead»). */
  correct?: boolean;
};

/** A context with no network: every request fails, so a missing fetcher is never an empty answer. */
const NO_NETWORK: SourceContext = {
  fetch: async () => ({
    ok: false,
    kind: 'network',
    message: 'no fetcher in the search context',
  }),
  userAgent: '',
  log: noLog,
};

function withTimeout(
  source: SourceAdapter,
  query: string,
  ctx: SourceContext,
  clock: Clock,
  timeoutMs: number,
): Promise<SourceOutcome> {
  let cancel = () => {};
  const expired = new Promise<SourceOutcome>(resolve => {
    cancel = clock.after(timeoutMs, () =>
      resolve({
        ok: false,
        kind: 'timeout',
        message: `no answer in ${timeoutMs} ms`,
      }),
    );
  });
  const answered = source.search(query, ctx).catch(
    (error: unknown): SourceOutcome => ({
      ok: false,
      kind: 'network',
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  return Promise.race([answered, expired]).finally(cancel);
}

function status(outcome: SourceOutcome): SourceStatus {
  if (!outcome.ok) {
    return {state: 'failed', kind: outcome.kind, message: outcome.message};
  }
  return outcome.results.length
    ? {state: 'ok', count: outcome.results.length}
    : {state: 'empty'};
}

type Pass = {outcome: SearchOutcome; suggestion?: string};

async function searchOnce(
  query: string,
  sources: readonly SourceAdapter[],
  ctx: SourceContext,
  clock: Clock,
  timeoutMs: number,
): Promise<Pass> {
  const outcomes = await Promise.all(
    sources.map(source =>
      withTimeout(
        source,
        query,
        ctx,
        clock,
        timeoutMs * (source.requests ?? 1),
      ),
    ),
  );
  const statuses: Record<string, SourceStatus> = {};
  sources.forEach((source, i) => {
    statuses[source.name] = status(outcomes[i]);
  });
  const results = rankForEink(
    outcomes.map(o => (o.ok ? o.results : [])),
    query,
  );
  const failed = outcomes.filter(o => !o.ok).length;
  const mainFailed = outcomes.some((o, i) => !o.ok && !sources[i].supplement);
  // The first source, in adapter order, that suggests a spelling.
  const suggestion = outcomes.find(o => o.ok && o.suggestion);
  return {
    outcome: {
      results,
      statuses,
      sourceDown: mainFailed && failed < sources.length,
      allFailed: failed === sources.length,
    },
    suggestion: suggestion?.ok ? suggestion.suggestion : undefined,
  };
}

/**
 * Searches every source in parallel and ranks what they found. When nothing was found and a
 * source suggested another spelling, the main sources search that spelling once (no supplement,
 * so at most their own requests more); its results show when it found any.
 */
export async function searchAll(
  query: string,
  sources: readonly SourceAdapter[],
  {
    ctx = NO_NETWORK,
    clock = systemClock,
    timeoutMs = SOURCE_TIMEOUT_MS,
    correct = true,
  }: SearchOptions = {},
): Promise<SearchOutcome> {
  const first = await searchOnce(query, sources, ctx, clock, timeoutMs);
  const {outcome, suggestion} = first;
  if (
    !correct ||
    !suggestion ||
    outcome.results.length > 0 ||
    outcome.allFailed
  ) {
    return outcome;
  }
  ctx.log(`search "${query}": nothing found, trying "${suggestion}"`);
  const main = sources.filter(source => !source.supplement);
  const second = await searchOnce(suggestion, main, ctx, clock, timeoutMs);
  if (second.outcome.results.length === 0) {
    ctx.log(`search "${suggestion}": nothing found either`);
    return outcome;
  }
  return {
    ...second.outcome,
    statuses: {...outcome.statuses, ...second.outcome.statuses},
    correctedQuery: suggestion,
  };
}
