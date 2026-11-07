/** `npm test` fails when a test logs after it ended (#86). */
const {LATE_LOG, lateLogCounter} = require('../scripts/test.cjs') as {
  LATE_LOG: string;
  lateLogCounter: () => (chunk: string) => number;
};

describe('the late-log check of npm test (#86)', () => {
  it('counts each late-log line, also one split across two chunks', () => {
    const count = lateLogCounter();
    const cut = 10;
    expect(count(`PASS a\n  ● ${LATE_LOG}. Did you forget\n`)).toBe(1);
    expect(count(`  ● ${LATE_LOG.slice(0, cut)}`)).toBe(1);
    expect(count(`${LATE_LOG.slice(cut)}. Did you\n`)).toBe(2);
  });

  it('counts nothing in a clean run', () => {
    const count = lateLogCounter();
    expect(count('PASS a\nTests: 2 passed, 2 total\n')).toBe(0);
  });
});
