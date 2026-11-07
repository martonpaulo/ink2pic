/**
 * What a search shows, as one explicit state: the screen maps each kind to one sentence and
 * never reads the outcome's flags itself.
 */
import type {SearchOutcome} from './search';
import type {FailureKind, SearchResult} from './types';

export type SearchState =
  | {kind: 'searching'}
  /** Every source answered; `results` is not empty. */
  | {kind: 'ready'; results: SearchResult[]}
  /** The query found nothing; these are the results of the spelling a source suggested. */
  | {kind: 'corrected'; results: SearchResult[]; query: string}
  /** Every source failed; these are the results of an earlier search, past their week. */
  | {kind: 'stale'; results: SearchResult[]}
  /** A main source failed or was skipped; the others' results, possibly none. */
  | {kind: 'partial'; results: SearchResult[]}
  /** Every source answered and none had a picture. */
  | {kind: 'empty'}
  /** Every source failed as a device with no network fails. */
  | {kind: 'offline'}
  /** Every source failed, at least one for another reason than the network. */
  | {kind: 'failed'};

export type SearchStateKind = SearchState['kind'];

/** Failure kinds that mean the device has no network, not that one source is down. */
const OFFLINE_KINDS: ReadonlySet<FailureKind> = new Set(['network', 'timeout']);

export function searchState(outcome: SearchOutcome): SearchState {
  const {results} = outcome;
  if (outcome.stale) {
    return {kind: 'stale', results};
  }
  if (outcome.allFailed) {
    const offline = Object.values(outcome.statuses).every(
      status =>
        (status.state === 'failed' || status.state === 'skipped') &&
        OFFLINE_KINDS.has(status.kind),
    );
    return {kind: offline ? 'offline' : 'failed'};
  }
  if (outcome.correctedQuery && results.length > 0) {
    return {kind: 'corrected', results, query: outcome.correctedQuery};
  }
  if (outcome.sourceDown) {
    return {kind: 'partial', results};
  }
  return results.length > 0 ? {kind: 'ready', results} : {kind: 'empty'};
}
