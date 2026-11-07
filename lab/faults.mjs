#!/usr/bin/env node
/**
 * The search under each single-source fault (#63): every case with one source down, slow,
 * throttled, broken or malformed, the others answering from the run's cache. Writes
 * `out/<run>/faults.json`: per fault, how many queries still fill page 1, how many show some or
 * no picture, and which line the screen shows how often. Run `run.mjs <run>` first, so the
 * other sources answer from the cache; a `slow` fault waits for each source timeout.
 *
 *   node lab/faults.mjs <run>
 */
import path from 'node:path';
import {checkProxy, product, readCases, runDir, writeJson} from './lib.mjs';
import {commit, FAULTS, runCases, SOURCE_NAMES} from './runner.mjs';

function summary(cases, pageSize) {
  const notices = {};
  for (const entry of cases) {
    const text = entry.notice?.text ?? '(none)';
    notices[text] = (notices[text] ?? 0) + 1;
  }
  return {
    fullPageOne: cases.filter(c => c.page1.length === pageSize).length,
    partialPageOne: cases.filter(
      c => c.page1.length > 0 && c.page1.length < pageSize,
    ).length,
    emptyPageOne: cases.filter(c => c.page1.length === 0).length,
    notices,
  };
}

checkProxy();
const name = process.argv[2];
const dir = runDir(name);
const {core} = product();
const cases = readCases();
const quiet = () => {};
const rows = [
  {
    fault: 'none',
    ...summary(await runCases(cases, {}, quiet), core.PAGE_SIZE),
  },
];
for (const source of SOURCE_NAMES) {
  for (const kind of Object.keys(FAULTS)) {
    const fault = `${source}=${kind}`;
    const out = await runCases(cases, {[source]: kind}, quiet);
    rows.push({fault, ...summary(out, core.PAGE_SIZE)});
    console.log(JSON.stringify(rows.at(-1)));
  }
}
writeJson(path.join(dir, 'faults.json'), {
  run: name,
  commit: commit(),
  queries: cases.length,
  pageSize: core.PAGE_SIZE,
  faults: rows,
});
console.log(`wrote ${path.join(dir, 'faults.json')}`);
