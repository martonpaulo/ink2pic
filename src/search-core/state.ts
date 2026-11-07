/**
 * What a search shows, as one explicit state: the screen maps each kind to one sentence and
 * never reads the outcome's flags itself.
 */
import {isThin} from './pages';
import type {SearchOutcome} from './search';
import type {FailureKind, SearchResult} from './types';

export type SearchState =
  | {kind: 'searching'}
  /** Every source answered; `results` is not empty. */
  | {kind: 'ready'; results: SearchResult[]}
  /** Page 1 was thin; the results of the spelling a source suggested lead (#84). */
  | {kind: 'corrected'; results: SearchResult[]; query: string}
  /** Every source failed; these are the results of an earlier search, past their week. */
  | {kind: 'stale'; results: SearchResult[]}
  /**
   * A source failed or was skipped while another answered, and page 1 is thin or empty (#82). A
   * full page 1 is `ready`: the missing source changed nothing the person needs to know.
   */
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

/** True when every source that needs the network failed for the network (#82, #91). */
export function networkDown(outcome: SearchOutcome): boolean {
  const others = Object.values(outcome.statuses).filter(
    status => !status.local,
  );
  return (
    others.length > 0 &&
    others.every(
      status =>
        (status.state === 'failed' || status.state === 'skipped') &&
        OFFLINE_KINDS.has(status.kind),
    )
  );
}

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
  // A local index alone is no answer offline, unless a picture it found is saved (#82, #91).
  if (networkDown(outcome) && !results.some(result => result.offlinePicture)) {
    return {kind: 'offline'};
  }
  if (outcome.correctedQuery && results.length > 0) {
    return {kind: 'corrected', results, query: outcome.correctedQuery};
  }
  const missing = Object.values(outcome.statuses).some(
    status => status.state === 'failed' || status.state === 'skipped',
  );
  if (missing && isThin(results.length)) {
    return {kind: 'partial', results};
  }
  return results.length > 0 ? {kind: 'ready', results} : {kind: 'empty'};
}
