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
};

export type SearchOptions = {
  ctx?: SourceContext;
  clock?: Clock;
  /** Per request; a source of `requests` requests gets that many times this. */
  timeoutMs?: number;
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

export async function searchAll(
  query: string,
  sources: readonly SourceAdapter[],
  {
    ctx = NO_NETWORK,
    clock = systemClock,
    timeoutMs = SOURCE_TIMEOUT_MS,
  }: SearchOptions = {},
): Promise<SearchOutcome> {
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
  return {
    results,
    statuses,
    sourceDown: mainFailed && failed < sources.length,
    allFailed: failed === sources.length,
  };
}
