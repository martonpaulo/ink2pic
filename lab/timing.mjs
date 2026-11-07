/**
 * Times the device's pixel schedule for pages 1 and 2 on this computer (#101), over the tiles of
 * an earlier `run.mjs`: `LabTiming.java` measures every thumbnail, converts the ones the run
 * showed converted or darkened, and prepares the first tile for the insert at the same moment.
 *
 *   node lab/timing.mjs <run> before|after [--native <dir>] [--rounds <n>]
 *
 * `before` is one worker for everything with a second measure of each converted file; `after` is
 * the thumbnail pool and the insert's own thread. `--native` names the folder holding the
 * `com/ink2pic/files` sources, `native/src` by default, so the code of another commit can be
 * timed. The first rounds warm the JVM up; the last is printed, and its summary.
 */
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {CACHE_DIR, LAB_DIR, OUT_DIR, ROOT_DIR, readJson} from './lib.mjs';

const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const VERSION_DIGITS = 12;
const DEFAULT_ROUNDS = 3;
const PERCENTILE_90 = 0.9;
const PIXEL_CLASSES = ['ThumbMeasures', 'EinkPixels', 'Contour', 'Decolor', 'PerceptualHash'];
/** The shown file of a converted tile: `<thumbnail>.<java version>.<contour|dark>.png`. */
const PREPARED = /\.[0-9a-f]+\.(contour|dark)\.png$/;

function option(name, fallback) {
  const at = process.argv.indexOf(name);
  return at === -1 ? fallback : process.argv[at + 1];
}

/** One `<file>\t<kind>` line per measured tile of pages 1 and 2, a blank line after each query. */
function input(run) {
  const results = readJson(path.join(OUT_DIR, run, 'results.json'));
  const queries = [];
  for (const item of results.cases) {
    const tiles = [...(item.page1 ?? []), ...(item.page2 ?? [])]
      .map(tile => tile.pixels)
      .filter(pixels => pixels?.file)
      .map(pixels => {
        const kind = pixels.converted ? 'contour' : pixels.darkened ? 'darken' : 'none';
        return `${pixels.file.replace(PREPARED, '')}\t${kind}`;
      });
    if (tiles.length > 0) {
      queries.push(tiles.join('\n'));
    }
  }
  return `${queries.join('\n\n')}\n`;
}

function compile(nativeDir) {
  const sources = [
    ...PIXEL_CLASSES.map(name => path.join(nativeDir, 'com/ink2pic/files', `${name}.java`)),
    path.join(LAB_DIR, 'LabTiming.java'),
  ];
  const version = createHash('sha1')
    .update(sources.map(file => fs.readFileSync(file)).join('\n'))
    .digest('hex')
    .slice(0, VERSION_DIGITS);
  const classes = path.join(CACHE_DIR, 'timing', version);
  if (!fs.existsSync(path.join(classes, 'LabTiming.class'))) {
    fs.mkdirSync(classes, {recursive: true});
    execFileSync('javac', ['-d', classes, ...sources], {stdio: 'pipe'});
  }
  return classes;
}

function quantile(values, share) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];
}

const [run, mode] = process.argv.slice(2);
if (!run || !['before', 'after'].includes(mode)) {
  console.error('usage: node lab/timing.mjs <run> before|after [--native <dir>] [--rounds <n>]');
  process.exit(2);
}
const nativeDir = path.resolve(option('--native', path.join(ROOT_DIR, 'native/src')));
const rounds = option('--rounds', String(DEFAULT_ROUNDS));
const out = execFileSync('java', ['-cp', compile(nativeDir), 'LabTiming', mode, rounds], {
  input: input(run),
  encoding: 'utf8',
  maxBuffer: MAX_OUTPUT_BYTES,
  stdio: ['pipe', 'pipe', 'inherit'],
});
const lines = out
  .split('\n')
  .filter(Boolean)
  .map(line => JSON.parse(line));
const summary = key => {
  const values = lines.map(line => line[key]);
  const total = values.reduce((sum, value) => sum + value, 0);
  return `median ${quantile(values, 0.5)} ms, p90 ${quantile(values, PERCENTILE_90)} ms, total ${total} ms`;
};
console.log(`${mode}: ${lines.length} queries, ${lines.reduce((n, line) => n + line.tiles, 0)} tiles`);
console.log(`  thumbnails ready: ${summary('thumbsMs')}`);
console.log(`  insert prepared:  ${summary('insertMs')}`);
