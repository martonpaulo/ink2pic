/** Time for the core, injected so tests run on a fake clock and the core needs no platform timer. */
export type Clock = {
  /** Milliseconds since the epoch. */
  now: () => number;
  /** Runs `run` after `ms`; the returned function cancels it. */
  after: (ms: number, run: () => void) => () => void;
};

export const systemClock: Clock = {
  now: () => Date.now(),
  after: (ms, run) => {
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
  },
};

export function sleep(clock: Clock, ms: number): Promise<void> {
  return new Promise(resolve => {
    clock.after(ms, resolve);
  });
}

/** One line for the caller's log; the core never decides where it goes. */
export type Log = (line: string) => void;

export const noLog: Log = () => {};
