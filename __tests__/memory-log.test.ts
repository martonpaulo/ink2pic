import {
  brief,
  log,
  logged,
  logLines,
  onLog,
  startLog,
  TIMEOUT_CODE,
  WAITS_FOR_PERSON,
} from '../src/log/memory';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  startLog();
});
afterEach(() => jest.restoreAllMocks());

describe('spike log', () => {
  it('records each call with its answer', async () => {
    await logged('getPageSize', () =>
      Promise.resolve({ok: true as const, value: {width: 1920}}),
    );
    await logged('getPageSize', () =>
      Promise.resolve({
        ok: false as const,
        code: 1503,
        message: 'no FILE:READ',
      }),
    );
    const lines = logLines();
    expect(lines[1]).toMatch(
      /^\+\d+ms getPageSize -> ok \{"width":1920\} \(\d+ ms\)$/,
    );
    expect(lines[3]).toMatch(/getPageSize -> error 1503: no FILE:READ/);
  });

  it('starts empty on each run', () => {
    log('a');
    startLog();
    expect(logLines()).toEqual([]);
  });

  it('cuts long values', () => {
    expect(brief('x'.repeat(10), 5)).toBe('"xxxx…(12)');
  });
});

describe('live log and timeouts (#11)', () => {
  it('tells listeners about each line and stops on request', () => {
    const seen: number[] = [];
    const stop = onLog(lines => seen.push(lines.length));
    log('a');
    log('b');
    stop();
    log('c');
    expect(seen).toEqual([1, 2]);
  });

  it('logs the start of a call and fails a call that never answers', async () => {
    jest.useFakeTimers();
    try {
      const pending = logged(
        'downloadToFile',
        () => new Promise<never>(() => {}),
        1000,
      );
      expect(logLines()[0]).toMatch(/downloadToFile …$/);
      await jest.advanceTimersByTimeAsync(1000);
      expect(await pending).toEqual({
        ok: false,
        code: TIMEOUT_CODE,
        message: 'TIMEOUT: no answer in 1000 ms',
      });
      expect(logLines()[1]).toMatch(/downloadToFile -> error -3: TIMEOUT/);
    } finally {
      jest.useRealTimers();
    }
  });

  it('waits as long as the person needs for a dialog (build 0.1.0 (10))', async () => {
    jest.useFakeTimers();
    try {
      let answer!: (value: {ok: true; value: number}) => void;
      const pending = logged(
        'requestPermission',
        () =>
          new Promise<{ok: true; value: number}>(resolve => (answer = resolve)),
        WAITS_FOR_PERSON,
      );
      await jest.advanceTimersByTimeAsync(60000);
      answer({ok: true, value: 2});
      expect(await pending).toEqual({ok: true, value: 2});
    } finally {
      jest.useRealTimers();
    }
  });
});
