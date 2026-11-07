/**
 * Searches every source in parallel; a slow or failing source never blocks the other
 * (brief section 8.5).
 */
import type {SourceAdapter, SourceContext} from './adapter';
import type {Breaker} from './breaker';
import {Clock, noLog, systemClock} from './clock';
import {SOURCE_TIMEOUT_MS} from './fetcher';
import {withoutAdult} from './filters/adult';
import {isThin} from './pages';
import {fallbackQueries, normalise} from './query';
import {DEFAULT_SCORERS, PHOTO_SCORERS, rankForEink} from './rank';
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
   * The spelling a source suggested, when page 1 was thin and the suggestion found pictures: its
   * results lead, the query's own follow (#65, #84). The query itself stays what the person typed.
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
  languages: [],
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
  // A thrown error is a fault in the adapter's code: a fetch failure arrives as an outcome (#104).
  const answered = source.search(query, ctx).catch(
    (error: unknown): SourceOutcome => {
      const message = error instanceof Error ? error.message : String(error);
      ctx.log(`search: ${source.name} threw: ${message}`);
      return {ok: false, kind: 'fault', message};
    },
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

function requestCount(source: SourceAdapter, ctx: SourceContext): number {
  const {requests = 1} = source;
  return typeof requests === 'function' ? requests(ctx) : requests;
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
        timeoutMs * requestCount(source, ctx),
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
  // Adult pictures never show, from any source (#69).
  const results = rankForEink(
    outcomes.map(o => (o.ok ? withoutAdult(o.results) : [])),
    query,
    ctx.photos ? PHOTO_SCORERS : DEFAULT_SCORERS,
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
 * Searches every source in parallel and ranks what they found. When page 1 is thin (`isThin`),
 * the main sources search once more (no supplement, so at most their own requests more). An
 * empty search tries the first of: the spelling a source suggested (Commons, then Wikipedia), the
 * word as a prefix, the phrase's longest word (#65, #71); those results show when they found any.
 * A search that found a few pictures tries only a source's suggestion: its results lead and the
 * first search's follow (#84).
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
  const {outcome} = first;
  const found = outcome.results.length;
  if (!correct || !isThin(found) || outcome.allFailed) {
    return outcome;
  }
  // One re-run at most, of the main sources: the first candidate that differs from the query.
  // A few pictures found: only a source's suggestion, never a cut word or a longer phrase's part.
  const typed = normalise(query).toLocaleLowerCase();
  const candidates = found
    ? [first.suggestion]
    : [first.suggestion, ...fallbackQueries(query)];
  const suggestion = candidates.find(
    candidate => candidate && candidate.toLocaleLowerCase() !== typed,
  );
  if (!suggestion) {
    return outcome;
  }
  ctx.log(
    `search "${query}": ${found ? `only ${found} found` : 'nothing found'}, ` +
      `trying "${suggestion}"`,
  );
  const main = sources.filter(source => !source.supplement);
  const second = await searchOnce(suggestion, main, run);
  if (second.outcome.results.length === 0) {
    ctx.log(`search "${suggestion}": nothing found either`);
    return outcome;
  }
  const seen = new Set(second.outcome.results.map(result => result.id));
  return {
    ...second.outcome,
    results: [
      ...second.outcome.results,
      ...outcome.results.filter(result => !seen.has(result.id)),
    ],
    statuses: {...outcome.statuses, ...second.outcome.statuses},
    sourceDown: outcome.sourceDown || second.outcome.sourceDown,
    correctedQuery: suggestion,
  };
}
