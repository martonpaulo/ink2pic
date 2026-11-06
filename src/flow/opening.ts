/**
 * The view-opening controller (#44): presses, lifecycle states and the decision on open come in,
 * the actions App performs go out. Pure, with the time passed in, so every host order is a test.
 *
 * Host behaviour it follows (brief section 10.5, docs/research/2026-11-pluginhost-sdk.md (d)):
 * the host replays the last press to a listener added within 1 s; the button event and
 * lifecycle 2 arrive as a pair, in that order; a hide because the Note app paused sends no
 * lifecycle event, so a later press is a new opening even with no lifecycle 3.
 *
 * Every opening is a flow with its own number. The latest one wins: a newer press makes every
 * older flow stale, and a stale flow never sets a screen or closes the view. One flow runs at a
 * time, so host calls never interleave: a press during a start waits, and only the latest
 * waiting press runs once the start ends.
 */
import {LifeState} from '../sdk/buttons';

/** The host replays the last press within 1 s of a new listener (#34); a margin on top. */
export const REPLAY_WINDOW_MS = 1500;

/** What the lasso read on open held, passed on so the flow does not read it again. */
export type OpenedLasso = object[] | undefined;

export type OpeningState = {
  /** The press this opening is for, and when it was handled; null until one comes. */
  chosen: {id: number; at: number} | null;
  /** The number of the latest flow: only it may set a screen or close the view. */
  flow: number;
  /** The flow whose host calls run now, if any. */
  running: number | null;
  /** The latest press that waits for the running flow to end. */
  queued: {id: number; lasso: OpenedLasso} | null;
};

export type OpeningEvent =
  | {type: 'press'; id: number; how: 'pending' | 'live'; now: number}
  | {type: 'decided'; id: number; lasso: OpenedLasso; now: number}
  | {type: 'lifecycle'; state: number}
  | {type: 'finished'; flow: number};

export type OpeningAction =
  | {type: 'log'; text: string}
  | {type: 'start'; id: number; flow: number; lasso: OpenedLasso}
  /** Read the lasso to decide which button opened the view, then send `decided`. */
  | {type: 'decide'}
  /** Show the starting screen: the view closed. */
  | {type: 'reset'};

export const initialOpening: OpeningState = {
  chosen: null,
  flow: 0,
  running: null,
  queued: null,
};

export type Step = {state: OpeningState; actions: OpeningAction[]};

/** Whether a flow is still the latest one. */
export function isCurrent(state: OpeningState, flow: number): boolean {
  return state.flow === flow;
}

/** Whether `decide` may still choose: no press came for this opening. */
export function undecided(state: OpeningState): boolean {
  return state.chosen === null;
}

function open(
  state: OpeningState,
  id: number,
  how: string,
  lasso: OpenedLasso,
  now: number,
): Step {
  // Only a replay is a duplicate; a later press is a new opening (#34).
  if (
    state.chosen &&
    state.chosen.id === id &&
    now - state.chosen.at < REPLAY_WINDOW_MS
  ) {
    return {
      state,
      actions: [{type: 'log', text: `button ${id} (${how}) already handled`}],
    };
  }
  const flow = state.flow + 1;
  const chosen = {id, at: now};
  const pressed: OpeningAction = {type: 'log', text: `button ${id} (${how})`};
  if (state.running !== null) {
    return {
      state: {...state, chosen, flow, queued: {id, lasso}},
      actions: [
        pressed,
        {type: 'log', text: `button ${id} waits for the start that runs`},
      ],
    };
  }
  return {
    state: {...state, chosen, flow, running: flow},
    actions: [pressed, {type: 'start', id, flow, lasso}],
  };
}

export function step(state: OpeningState, event: OpeningEvent): Step {
  switch (event.type) {
    case 'press':
      return open(state, event.id, event.how, undefined, event.now);
    case 'decided':
      if (!undecided(state)) {
        return {state, actions: []};
      }
      return open(state, event.id, 'decided on open', event.lasso, event.now);
    case 'lifecycle': {
      const logLine: OpeningAction = {
        type: 'log',
        text: `lifecycle ${event.state}`,
      };
      if (event.state === LifeState.stop) {
        // Closed: the next opening starts fresh (gorlix pattern 9); every flow is stale.
        return {
          state: {...state, chosen: null, flow: state.flow + 1, queued: null},
          actions: [logLine, {type: 'reset'}],
        };
      }
      if (event.state === LifeState.start && undecided(state)) {
        return {state, actions: [logLine, {type: 'decide'}]};
      }
      return {state, actions: [logLine]};
    }
    case 'finished': {
      if (state.running !== event.flow) {
        return {state, actions: []};
      }
      if (state.queued === null) {
        return {state: {...state, running: null}, actions: []};
      }
      const {id, lasso} = state.queued;
      return {
        state: {...state, running: state.flow, queued: null},
        actions: [{type: 'start', id, flow: state.flow, lasso}],
      };
    }
  }
}
