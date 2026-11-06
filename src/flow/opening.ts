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
 *
 * Each opening starts its own session log first (#58), so session.log holds one whole opening:
 * its lifecycle line, the lasso decision and the press. The decision on mount goes through the
 * controller too, so a fresh runtime keeps the previous runtime's file as session.prev.log.
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
  /** Whether this opening started its session log; a lifecycle 2 can start it before a press. */
  session: boolean;
};

export type OpeningEvent =
  /** The view mounted, after any pending press was dispatched. */
  | {type: 'mount'}
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
  | {type: 'reset'}
  /** Start the session log of a new opening, before its first line (#58). */
  | {type: 'startSession'};

export const initialOpening: OpeningState = {
  chosen: null,
  flow: 0,
  running: null,
  queued: null,
  session: false,
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
  // A press after a chosen one is a new opening; otherwise a lifecycle 2 may have started it.
  const opened: OpeningAction[] =
    state.chosen !== null || !state.session ? [{type: 'startSession'}] : [];
  const pressed: OpeningAction = {type: 'log', text: `button ${id} (${how})`};
  if (state.running !== null) {
    return {
      state: {...state, chosen, flow, queued: {id, lasso}, session: true},
      actions: [
        ...opened,
        pressed,
        {type: 'log', text: `button ${id} waits for the start that runs`},
      ],
    };
  }
  return {
    state: {...state, chosen, flow, running: flow, session: true},
    actions: [...opened, pressed, {type: 'start', id, flow, lasso}],
  };
}

/**
 * Starts the session log unless this opening already did, then `then`. The session comes before
 * the opening's first line and first logged call: a call flushes the log to session.log, and the
 * first opening of a runtime copies the previous runtime's file to session.prev.log (#58).
 */
function inSession(state: OpeningState, then: OpeningAction[]): Step {
  const opened: OpeningAction[] = state.session ? [] : [{type: 'startSession'}];
  return {state: {...state, session: true}, actions: [...opened, ...then]};
}

export function step(state: OpeningState, event: OpeningEvent): Step {
  switch (event.type) {
    case 'mount':
      // Decide now, unless a pending press already chose.
      return undecided(state)
        ? inSession(state, [{type: 'decide'}])
        : {state, actions: []};
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
          state: {
            ...state,
            chosen: null,
            flow: state.flow + 1,
            queued: null,
            session: false,
          },
          actions: [logLine, {type: 'reset'}],
        };
      }
      if (event.state === LifeState.start && undecided(state)) {
        return inSession(state, [logLine, {type: 'decide'}]);
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
