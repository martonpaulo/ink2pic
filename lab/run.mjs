#!/usr/bin/env node
/**
 * Runs every case of `cases.json` through the product search (#63) and writes
 * `out/<run>/results.json` with pages 1 and 2 of each. `--fault` replaces a source's fetch with a
 * fault (`down`, `slow`, `throttled` or 429, `broken` or 500, `malformed`); see `runner.mjs`.
 *
 *   node lab/run.mjs <run> [--fault <source>=<kind>[,<source>=<kind>]]
 */
import path from 'node:path';
import {
  checkProxy,
  product,
  readCases,
  ROOT_DIR,
  runDir,
  writeJson,
} from './lib.mjs';
import {commit, parseFaults, runCases} from './runner.mjs';

const [name, flag, spec] = process.argv.slice(2);
const dir = runDir(name);
if (flag !== undefined && flag !== '--fault') {
  throw new Error(
    `unknown option ${flag}; usage: run.mjs <run> [--fault <spec>]`,
  );
}
const faults = parseFaults(spec);
checkProxy();
const {config, core} = product();
const measured = commit();
const save = cases =>
  writeJson(path.join(dir, 'results.json'), {
    run: name,
    commit: measured,
    faults,
    userAgent: config.USER_AGENT,
    pageSize: core.PAGE_SIZE,
    cases,
  });
// Saved after each query, so the sheets and the numbers can start before the run ends.
const cases = await runCases(readCases(), faults, console.log, save);
const failed = cases.filter(c =>
  Object.entries(c.statuses).some(
    ([source, s]) => s.state === 'failed' && !faults[source],
  ),
);
console.log(
  `wrote ${path.relative(ROOT_DIR, dir)}/results.json; ${
    failed.length
  } queries with a failed source` +
    (failed.length
      ? `: run it again to ask only for those (${failed
          .map(c => c.id)
          .join(', ')})`
      : ''),
);
