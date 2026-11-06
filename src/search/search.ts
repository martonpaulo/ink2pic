/**
 * Searches every source in parallel; a slow or failing source never blocks the other
 * (brief section 8.5).
 */
import {SOURCE_TIMEOUT_MS} from '../sources/http';
import type {FailureKind, SearchResult, SourceOutcome} from '../sources/types';
import {rankForEink} from './rank';

export type Source = {
  name: string;
  search: (query: string) => Promise<SourceOutcome>;
  /**
   * Requests the source makes in a row, 1 by default: each gets the whole timeout, so a slow
   * second request never drops what the first one found (#43).
   */
  requests?: number;
  /**
   * Adds pictures to the other sources (Wikidata, #43): its failure is no «source down» note and
   * does not keep the search out of the cache.
   */
  supplement?: true;
};

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

function withTimeout(
  source: Source,
  query: string,
  timeoutMs: number,
): Promise<SourceOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<SourceOutcome>(resolve => {
    timer = setTimeout(
      () =>
        resolve({
          ok: false,
          kind: 'timeout',
          message: `no answer in ${timeoutMs} ms`,
        }),
      timeoutMs,
    );
  });
  const answered = source.search(query).catch(
    (error: unknown): SourceOutcome => ({
      ok: false,
      kind: 'network',
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  return Promise.race([answered, expired]).finally(() => clearTimeout(timer));
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
  sources: readonly Source[],
  {timeoutMs = SOURCE_TIMEOUT_MS} = {},
): Promise<SearchOutcome> {
  const outcomes = await Promise.all(
    sources.map(source =>
      withTimeout(source, query, timeoutMs * (source.requests ?? 1)),
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
