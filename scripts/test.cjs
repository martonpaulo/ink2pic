#!/usr/bin/env node
/**
 * `npm test`: runs Jest with the given arguments and fails when a test logs after it ended (#86).
 * Jest only warns «Cannot log after tests are done» and still passes; such a line means a test
 * left work running (a timer, an unawaited promise), so the fix is to await or clear it in the
 * code or the test, never to silence the console.
 */
const {spawn} = require('node:child_process');

const LATE_LOG = 'Cannot log after tests are done';

/** Counts the late-log lines in a stream given chunk by chunk, also across a chunk's edge. */
function lateLogCounter() {
  let carried = '';
  let count = 0;
  return chunk => {
    const text = carried + chunk;
    count += text.split(LATE_LOG).length - 1;
    // Shorter than the line, so a line counted above is never counted again.
    carried = text.slice(-(LATE_LOG.length - 1));
    return count;
  };
}

function main() {
  const jest = spawn(
    process.execPath,
    [require.resolve('jest/bin/jest'), ...process.argv.slice(2)],
    {stdio: ['inherit', 'pipe', 'pipe']}
  );
  let late = 0;
  for (const [from, to] of [
    [jest.stdout, process.stdout],
    [jest.stderr, process.stderr],
  ]) {
    const count = lateLogCounter();
    let seen = 0;
    from.on('data', chunk => {
      to.write(chunk);
      const now = count(chunk.toString());
      late += now - seen;
      seen = now;
    });
  }
  jest.on('close', code => {
    if (late > 0) {
      process.stderr.write(
        `test: ${late} «${LATE_LOG}» line(s): a test left work running; await it or clear its timer (#86)\n`
      );
      process.exit(1);
    }
    process.exit(code === null ? 1 : code);
  });
}

if (require.main === module) {
  main();
}

module.exports = {LATE_LOG, lateLogCounter};
