/** The opening controller (#44): host event orders in, actions out. */
import {
  initialOpening,
  isCurrent,
  OpeningAction,
  OpeningEvent,
  OpeningState,
  REPLAY_WINDOW_MS,
  step,
} from '../src/flow/opening';

/**
 * Runs the events in order; returns the final state and every action that is not a log or a
 * session start, which the session tests below cover.
 */
function run(events: OpeningEvent[], from: OpeningState = initialOpening) {
  let state = from;
  const actions: OpeningAction[] = [];
  for (const event of events) {
    const next = step(state, event);
    state = next.state;
    actions.push(
      ...next.actions.filter(
        a => a.type !== 'log' && a.type !== 'startSession',
      ),
    );
  }
  return {state, actions};
}

const press = (id: number, now: number): OpeningEvent => ({
  type: 'press',
  id,
  how: 'live',
  now,
});
const stop: OpeningEvent = {type: 'lifecycle', state: 3};
const show: OpeningEvent = {type: 'lifecycle', state: 2};

it('drops the host replay of a press within the replay window', () => {
  const {actions} = run([press(200, 0), press(200, REPLAY_WINDOW_MS - 1)]);
  expect(actions).toEqual([
    {type: 'start', id: 200, flow: 1, lasso: undefined},
  ]);
});

it('takes a later press after a silent hide as a new opening', () => {
  const first = run([press(200, 0), {type: 'finished', flow: 1}]);
  const {state, actions} = run([press(200, 60_000)], first.state);
  expect(actions).toEqual([
    {type: 'start', id: 200, flow: 2, lasso: undefined},
  ]);
  expect(isCurrent(state, 1)).toBe(false);
});

it('decides on show only when no press came', () => {
  expect(run([show]).actions).toEqual([{type: 'decide'}]);
  // The button event comes first and lifecycle 2 with it.
  const pressed = run([press(100, 0), show]);
  expect(pressed.actions).toEqual([
    {type: 'start', id: 100, flow: 1, lasso: undefined},
  ]);
  const late = run(
    [{type: 'decided', id: 200, lasso: [{}], now: 1}],
    pressed.state,
  );
  expect(late.actions).toEqual([]);
});

it('a stop during a start makes that start stale and shows the starting screen', () => {
  const {state, actions} = run([press(200, 0), stop]);
  expect(actions).toEqual([
    {type: 'start', id: 200, flow: 1, lasso: undefined},
    {type: 'reset'},
  ]);
  expect(isCurrent(state, 1)).toBe(false);
});

it('a press during a start waits, then runs with the latest flow', () => {
  const lasso = [{type: 700}];
  const {state, actions} = run([
    press(200, 0),
    stop,
    show,
    {type: 'decided', id: 200, lasso, now: 2_000},
    {type: 'finished', flow: 1},
  ]);
  expect(actions).toEqual([
    {type: 'start', id: 200, flow: 1, lasso: undefined},
    {type: 'reset'},
    {type: 'decide'},
    {type: 'start', id: 200, flow: 3, lasso},
  ]);
  expect(isCurrent(state, 3)).toBe(true);
});

it('only the latest waiting press runs', () => {
  const {actions} = run([
    press(200, 0),
    press(100, 2_000),
    press(200, 4_000),
    {type: 'finished', flow: 1},
  ]);
  expect(actions).toEqual([
    {type: 'start', id: 200, flow: 1, lasso: undefined},
    {type: 'start', id: 200, flow: 3, lasso: undefined},
  ]);
});

it('a stop drops a waiting press', () => {
  const {state, actions} = run([
    press(200, 0),
    press(100, 2_000),
    stop,
    {type: 'finished', flow: 1},
  ]);
  expect(actions).toEqual([
    {type: 'start', id: 200, flow: 1, lasso: undefined},
    {type: 'reset'},
  ]);
  expect(state.running).toBeNull();
});

describe('the onboarding hand-off (#95)', () => {
  const onboarded = (flow: number): OpeningEvent => ({
    type: 'onboarded',
    id: 200,
    flow,
  });

  it('runs the current flow as a tracked start: a press during it waits', () => {
    const {state, actions} = run([
      press(200, 0),
      {type: 'finished', flow: 1},
      onboarded(1),
      press(100, 2_000),
      {type: 'finished', flow: 1},
    ]);
    expect(actions).toEqual([
      {type: 'start', id: 200, flow: 1, lasso: undefined},
      {type: 'resume', id: 200, flow: 1},
      {type: 'start', id: 100, flow: 2, lasso: undefined},
    ]);
    expect(state.running).toBe(2);
  });

  it('drops a hand-off for a stale flow', () => {
    const {actions} = run([
      press(200, 0),
      {type: 'finished', flow: 1},
      stop,
      onboarded(1),
    ]);
    expect(actions).toEqual([
      {type: 'start', id: 200, flow: 1, lasso: undefined},
      {type: 'reset'},
    ]);
  });

  it('never runs beside a flow that runs', () => {
    const {actions} = run([press(200, 0), onboarded(1)]);
    expect(actions).toEqual([
      {type: 'start', id: 200, flow: 1, lasso: undefined},
    ]);
  });
});

describe('the session log of an opening (#58)', () => {
  /** Every action, logs included, so the order of startSession and the first line shows. */
  function all(events: OpeningEvent[], from: OpeningState = initialOpening) {
    let state = from;
    const actions: OpeningAction[] = [];
    for (const event of events) {
      const next = step(state, event);
      state = next.state;
      actions.push(...next.actions);
    }
    return {state, actions};
  }
  const sessions = (actions: OpeningAction[]) =>
    actions.filter(a => a.type === 'startSession').length;

  it('starts the session before the first line of a press', () => {
    const {actions} = all([press(200, 0)]);
    expect(actions[0]).toEqual({type: 'startSession'});
    expect(actions[1]).toEqual({type: 'log', text: 'button 200 (live)'});
  });

  it('starts the session before the lifecycle line of an opening decided on show', () => {
    const {actions} = all([
      show,
      {type: 'decided', id: 100, lasso: undefined, now: 0},
    ]);
    expect(actions[0]).toEqual({type: 'startSession'});
    expect(actions[1]).toEqual({type: 'log', text: 'lifecycle 2'});
    expect(sessions(actions)).toBe(1);
  });

  it('starts the session before the decision on mount, before its first logged call', () => {
    const {actions} = all([{type: 'mount'}]);
    expect(actions).toEqual([{type: 'startSession'}, {type: 'decide'}]);
  });

  it('starts one session for a mount decision and its lifecycle 2', () => {
    expect(sessions(all([{type: 'mount'}, show]).actions)).toBe(1);
  });

  it('decides nothing on mount after a pending press', () => {
    const {actions} = all([press(200, 0), {type: 'mount'}]);
    expect(actions.filter(a => a.type === 'decide')).toEqual([]);
    expect(sessions(actions)).toBe(1);
  });

  it('starts one session for a press and its lifecycle 2', () => {
    expect(sessions(all([press(100, 0), show]).actions)).toBe(1);
  });

  it('starts no session for a replay', () => {
    const {actions} = all([press(200, 0), press(200, REPLAY_WINDOW_MS - 1)]);
    expect(sessions(actions)).toBe(1);
  });

  it('starts a new session at a press after a silent hide and after a close', () => {
    const first = all([press(200, 0), {type: 'finished', flow: 1}]);
    expect(sessions(all([press(200, 60_000)], first.state).actions)).toBe(1);
    expect(sessions(all([stop, show], first.state).actions)).toBe(1);
  });
});
