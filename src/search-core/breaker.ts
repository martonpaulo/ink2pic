/**
 * The circuit breaker of each source (#65): a source that failed in two searches in a row, while
 * another source answered, is skipped for five minutes, so one dead or throttled source costs no
 * more waiting. In memory only: it resets when the plugin starts. A failure while no other source
 * answered says the device is offline, not that the source is down, and does not count.
 */
import {Clock, systemClock} from './clock';
import type {Failure} from './types';

export const BREAKER_FAILURES = 2;
export const BREAKER_OPEN_MS = 5 * 60 * 1000;

export type Breaker = {
  /** The failure that opened the breaker of `source`, while it is open; else null. */
  open: (source: string) => {failure: Failure; until: number} | null;
  /** One search's answer of `source`; `othersAnswered` when another source answered it. */
  record: (
    source: string,
    outcome: {ok: true} | Failure,
    othersAnswered: boolean,
  ) => void;
};

type State = {failures: number; last?: Failure; until: number};

export function createBreaker({
  clock = systemClock,
  failures = BREAKER_FAILURES,
  openMs = BREAKER_OPEN_MS,
}: {clock?: Clock; failures?: number; openMs?: number} = {}): Breaker {
  const states = new Map<string, State>();
  return {
    open: source => {
      const state = states.get(source);
      return state?.last && clock.now() < state.until
        ? {failure: state.last, until: state.until}
        : null;
    },
    record: (source, outcome, othersAnswered) => {
      if (outcome.ok) {
        states.delete(source);
        return;
      }
      if (!othersAnswered) {
        return;
      }
      const state = states.get(source) ?? {failures: 0, until: 0};
      state.failures += 1;
      state.last = outcome;
      // Still failing after a pause: open again at once, without waiting for two more.
      if (state.failures >= failures) {
        state.until = clock.now() + openMs;
      }
      states.set(source, state);
    },
  };
}
