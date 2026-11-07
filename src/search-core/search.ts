/**
 * Searches every source in parallel; a slow or failing source never blocks the other
 * (brief section 8.5).
 */
import type {SourceAdapter, SourceContext} from './adapter';
import type {Breaker} from './breaker';
import {Clock, noLog, systemClock} from './clock';
import {SOURCE_TIMEOUT_MS} from './fetcher';
import {rankForEink} from './rank';
import type {FailureKind, SearchResult, SourceOutcome} from './types';

export type SourceStatus =
  | {state: 'ok'; count: number}
  | {state: 'empty'}
  | {state: 'failed'; kind: FailureKind; message: string}
  /** Not asked: its breaker is open after failing twice in a row (#65). */
  | {state: 'skipped'; kind: FailureKind; message: string};

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
  /** An expired cached answer, shown because every source failed (#65). */
  stale?: true;
};

export type SearchOptions = {
  ctx?: SourceContext;
  clock?: Clock;
  /** Per request; a source of `requests` requests gets that many times this. */
  timeoutMs?: number;
  /** False searches exactly the query: no corrected search («Search for X instead»). */
  correct?: boolean;
  /** Skips a source that keeps failing; none when absent. */
  breaker?: Breaker;
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

type Run = {
  ctx: SourceContext;
  clock: Clock;
  timeoutMs: number;
  breaker?: Breaker;
};

/** The sources whose breaker is open, unless that is every main source: one must be asked. */
function skippedSources(
  sources: readonly SourceAdapter[],
  {breaker, ctx}: Run,
): ReturnType<Breaker['open']>[] {
  const open = sources.map(source => breaker?.open(source.name) ?? null);
  const mainAsked = sources.some((source, i) => !source.supplement && !open[i]);
  if (!mainAsked && open.some(Boolean)) {
    ctx.log('breaker: every main source is open; asking them all');
    return sources.map(() => null);
  }
  return open;
}

function recordAnswers(
  sources: readonly SourceAdapter[],
  outcomes: readonly SourceOutcome[],
  skipped: readonly ReturnType<Breaker['open']>[],
  {breaker, ctx}: Run,
): void {
  sources.forEach((source, i) => {
    if (!breaker || skipped[i]) {
      return;
    }
    const others = outcomes.some((o, j) => j !== i && o.ok && !skipped[j]);
    breaker.record(source.name, outcomes[i], others);
    const opened = breaker.open(source.name);
    if (opened) {
      ctx.log(
        `breaker: ${
          source.name
        } failed twice in a row; skipped until ${new Date(
          opened.until,
        ).toISOString()}`,
      );
    }
  });
}

async function searchOnce(
  query: string,
  sources: readonly SourceAdapter[],
  run: Run,
): Promise<Pass> {
  const {ctx, clock, timeoutMs} = run;
  const skipped = skippedSources(sources, run);
  const outcomes = await Promise.all(
    sources.map((source, i) => {
      const open = skipped[i];
      if (open) {
        ctx.log(`breaker: ${source.name} skipped: ${open.failure.message}`);
        return Promise.resolve(open.failure);
      }
      return withTimeout(
        source,
        query,
        ctx,
        clock,
        timeoutMs * (source.requests ?? 1),
      );
    }),
  );
  recordAnswers(sources, outcomes, skipped, run);
  const statuses: Record<string, SourceStatus> = {};
  sources.forEach((source, i) => {
    const outcome = outcomes[i];
    statuses[source.name] =
      skipped[i] && !outcome.ok
        ? {state: 'skipped', kind: outcome.kind, message: outcome.message}
        : status(outcome);
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
    breaker,
  }: SearchOptions = {},
): Promise<SearchOutcome> {
  const run: Run = {ctx, clock, timeoutMs, breaker};
  const first = await searchOnce(query, sources, run);
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
  const second = await searchOnce(suggestion, main, run);
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
