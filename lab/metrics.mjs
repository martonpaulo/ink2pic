#!/usr/bin/env node
/**
 * The numbers of a run (#63), per query and overall, into `out/<run>/metrics.json`:
 *
 * - `ok`: the expected kind of picture is on page 1, as judged by a person in
 *   `out/<run>/judgment.json` (`{"<case id>": {"ok": true, "reason": "...", "flags": {...}}}`);
 * - per page 1: text-only pictures, signatures, near-black pictures, logos nobody asked for, and
 *   empty pages. Signatures and logos are read from the titles, near-black from the pixels;
 *   `flags` in the judgment adds tiles by their 0-based index, and is the only source of text-only
 *   pictures;
 * - each tile's pixel measures (`pixels.py`), as data for research.
 *
 *   node lab/metrics.mjs <run>            the run's numbers
 *   node lab/metrics.mjs <before> <after> both runs' numbers, and what changed per query
 */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  checkProxy,
  LAB_DIR,
  pageOneThumbs,
  readJson,
  readJudgment,
  readResults,
  runDir,
  writeJson,
} from './lib.mjs';

/** Mean luminance on white below which a tile reads as a black block on e-ink. */
const NEAR_BLACK_MEAN = 64;
const SIGNATURE =
  /\b(signature|signatures|autograph|firma|assinatura|unterschrift)\b/i;
const LOGO = /\b(logo|logos|logotype|wordmark)\b/i;
const FLAGS = ['text', 'signature', 'dark', 'logo'];
const PERCENT = 100;
const HALF = 0.5;
/** The pixel measures of every tile of a run fit well inside. */
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

function pixels(files) {
  const list = [...new Set([...files.values()].filter(Boolean))];
  const out = execFileSync('python3', [path.join(LAB_DIR, 'pixels.py')], {
    input: JSON.stringify(list),
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  return JSON.parse(out);
}

/** A logo is wanted when the query asks for one or names a brand. */
const logoWanted = entry =>
  entry.category === 'brand' || LOGO.test(entry.query);

function caseMetrics(entry, judged, measures) {
  const flags = Object.fromEntries(
    FLAGS.map(flag => [flag, new Set(judged?.flags?.[flag] ?? [])]),
  );
  const tiles = entry.page1.map((tile, index) => {
    const pixel = measures[tile.file] ?? null;
    if (SIGNATURE.test(tile.title)) {
      flags.signature.add(index);
    }
    if (LOGO.test(tile.title) && !logoWanted(entry)) {
      flags.logo.add(index);
    }
    if (pixel && pixel.meanOnWhite < NEAR_BLACK_MEAN) {
      flags.dark.add(index);
    }
    return {id: tile.id, title: tile.title, pixels: pixel};
  });
  if (logoWanted(entry)) {
    flags.logo.clear();
  }
  return {
    id: entry.id,
    category: entry.category,
    query: entry.query,
    ok: judged ? judged.ok : null,
    reason: judged?.reason ?? null,
    empty: entry.page1.length === 0,
    counts: Object.fromEntries(FLAGS.map(flag => [flag, flags[flag].size])),
    page1: entry.page1.map(tile => tile.id),
    tiles,
  };
}

const share = (part, whole) =>
  whole
    ? `${Math.round((PERCENT * part) / whole)}% (${part}/${whole})`
    : 'not judged';

function summary(cases, pageSize) {
  const judged = cases.filter(c => c.ok !== null);
  const categories = [...new Set(cases.map(c => c.category))];
  const byCategory = Object.fromEntries(
    categories.map(category => {
      const inIt = judged.filter(c => c.category === category);
      return [category, share(inIt.filter(c => c.ok).length, inIt.length)];
    }),
  );
  const totals = Object.fromEntries(
    FLAGS.map(flag => [
      flag,
      cases.reduce((sum, c) => sum + c.counts[flag], 0),
    ]),
  );
  const measured = cases
    .flatMap(c => c.tiles.map(t => t.pixels))
    .filter(p => p && p.error === undefined);
  return {
    queries: cases.length,
    expectedOnPageOne: share(judged.filter(c => c.ok).length, judged.length),
    byCategory,
    tiles: {
      ...totals,
      emptyPages: cases.filter(c => c.empty).length,
      fullPages: cases.filter(c => c.page1.length === pageSize).length,
    },
    // Data for research: how page 1 would look if the device drew transparency as black.
    pixels: {
      measured: measured.length,
      halfTransparent: measured.filter(p => p.transparent >= HALF).length,
      nearBlackOnBlack: measured.filter(p => p.meanOnBlack < NEAR_BLACK_MEAN)
        .length,
    },
  };
}

/**
 * The run's numbers, from its results; a run whose results are not kept here (`results.json` is
 * not committed) gives the numbers it committed, so a new run compares with the baseline.
 */
async function metrics(name) {
  const committed = path.join(runDir(name), 'metrics.json');
  if (!fs.existsSync(path.join(runDir(name), 'results.json'))) {
    return readJson(committed);
  }
  const results = readResults(name);
  const judgment = readJudgment(name);
  const files = await pageOneThumbs(results);
  const measures = pixels(files);
  const cases = results.cases.map(entry =>
    caseMetrics(
      {
        ...entry,
        page1: entry.page1.map(tile => ({
          ...tile,
          // What the tile shows: its contour drawing when the device converts it (#81).
          file: tile.pixels?.file ?? files.get(tile.thumb),
        })),
      },
      judgment[entry.id],
      measures,
    ),
  );
  const out = {
    run: name,
    commit: results.commit,
    summary: summary(cases, results.pageSize),
    cases,
  };
  writeJson(committed, out);
  return out;
}

function print(run) {
  console.log(`\n${run.run} at ${run.commit}`);
  console.log(JSON.stringify(run.summary, null, 1));
}

/** Per query: whether page 1 changed, and the judgment and counts before and after. */
function compare(before, after) {
  const old = new Map(before.cases.map(c => [c.id, c]));
  for (const now of after.cases) {
    const was = old.get(now.id);
    if (!was) {
      console.log(`${now.id}: new case`);
      continue;
    }
    const same = was.page1.join() === now.page1.join();
    const counts = FLAGS.filter(f => was.counts[f] !== now.counts[f])
      .map(f => `${f} ${was.counts[f]}->${now.counts[f]}`)
      .join(', ');
    const verdict = was.ok === now.ok ? '' : `, ok ${was.ok}->${now.ok}`;
    if (!same || counts || verdict) {
      console.log(
        `${now.id}: ${same ? 'same page 1' : 'page 1 changed'}${verdict}${
          counts ? `, ${counts}` : ''
        }`,
      );
    }
  }
}

checkProxy();
const names = process.argv.slice(2);
const runs = [];
for (const name of names) {
  runs.push(await metrics(name));
  print(runs.at(-1));
}
if (runs.length === 2) {
  console.log(`\n${names[0]} -> ${names[1]}, per query:`);
  compare(...runs);
}
