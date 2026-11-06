import {brief, log, logged, logLines, startLog} from '../src/log/memory';

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
    expect(lines[0]).toMatch(
      /^\+\d+ms getPageSize -> ok \{"width":1920\} \(\d+ ms\)$/,
    );
    expect(lines[1]).toMatch(/getPageSize -> error 1503: no FILE:READ/);
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
