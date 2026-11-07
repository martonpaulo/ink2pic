/**
 * The device's pixel step in the lab (#81): before page 1 shows, the device measures the
 * thumbnails of pages 1 and 2, turns the ones `chooseLook` names into contour drawings or darkens
 * them, and re-sorts them with `orderMeasured` (src/flow/measure.ts, #66). The measures and the drawing
 * are the plugin's own Java (`LabPixels.java` over `native/src`); the decisions are the search
 * core's own functions. Without a JDK the lab stops: a text-only order is not what the device
 * shows.
 */
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {CACHE_DIR, LAB_DIR, ROOT_DIR, thumbFile} from './lib.mjs';

const NATIVE = path.join(ROOT_DIR, 'native/src/com/ink2pic/files');
const SOURCES = [
  path.join(NATIVE, 'ThumbMeasures.java'),
  path.join(NATIVE, 'EinkPixels.java'),
  path.join(NATIVE, 'Contour.java'),
  path.join(NATIVE, 'Decolor.java'),
  path.join(NATIVE, 'PerceptualHash.java'),
  path.join(LAB_DIR, 'LabPixels.java'),
];
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const DIGITS = 2;
const VERSION_DIGITS = 12;

/**
 * The Java's version: classes and contour drawings are kept per version, so a change to
 * `native/src` never meets a drawing an older `Contour.java` made.
 */
const version = createHash('sha1')
  .update(SOURCES.map(file => fs.readFileSync(file)).join('\n'))
  .digest('hex')
  .slice(0, VERSION_DIGITS);
const CLASSES = path.join(CACHE_DIR, 'java', version);

/** Compiles the Java once per version. */
function compile() {
  if (!fs.existsSync(path.join(CLASSES, 'LabPixels.class'))) {
    fs.mkdirSync(CLASSES, {recursive: true});
    execFileSync('javac', ['-d', CLASSES, ...SOURCES], {stdio: 'pipe'});
  }
}

/** Each file's measures, contour measures and contour file, by file. */
function measureFiles(files) {
  compile();
  const out = execFileSync('java', ['-cp', CLASSES, 'LabPixels', version], {
    input: files.join('\n'),
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return new Map(
    out
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line))
      .map(entry => [entry.file, entry]),
  );
}

/**
 * The device's style (#70): «All contour» and «Photos too», both off as the device's default
 * style, «Drawings», has them.
 */
export const DEFAULT_STYLE = {allContour: false, photos: false};

/**
 * The pure part of the pixel step: `results` in the order the device shows them, from each
 * result's LabPixels entry (`entries`, by result id), through the search core's own `chooseLook`
 * and `orderMeasured` (src/flow/measure.ts calls the same two). `{results, shown}`, `shown` by
 * result id holding its kind, line-art score, ink share and the file the tile shows.
 */
export function orderEntries(
  results,
  entries,
  query,
  core,
  style = DEFAULT_STYLE,
) {
  const {chooseLook, orderMeasured, pixelKind, lineArt} = core;
  const prepared = new Map();
  const shown = new Map();
  for (const [id, {entry, file}] of entries) {
    // A speckled contour is shown as found, faint lines darkened, as the device does (#81, #83).
    const look = chooseLook(
      entry.measures,
      query,
      style.allContour,
      entry.contour,
    );
    const m =
      look === 'contour'
        ? entry.contour
        : look === 'darkened'
        ? entry.darkened
        : entry.measures;
    prepared.set(id, {measures: m, look});
    shown.set(id, {
      kind: pixelKind(entry.measures),
      shownKind: pixelKind(m),
      lineArt: Number(lineArt(m).toFixed(DIGITS)),
      ink: Number(entry.measures.ink.toFixed(DIGITS + 1)),
      converted: look === 'contour',
      darkened: look === 'darkened',
      darkest: entry.measures.darkest,
      file:
        look === 'contour'
          ? entry.contourFile
          : look === 'darkened'
          ? entry.darkenedFile
          : file,
    });
  }
  // Near-duplicates leave the list, as on the device (#89).
  return {
    results: orderMeasured(results, prepared, query, style.photos),
    shown,
  };
}

/**
 * `results` as the device orders them after the pixel step: the thumbnails of pages 1 and 2
 * downloaded, measured by LabPixels, then `orderEntries`.
 */
export async function pixelOrder(
  results,
  query,
  core,
  userAgent,
  style = DEFAULT_STYLE,
) {
  const head = results.slice(0, core.MEASURED_RESULTS);
  const files = new Map();
  for (const result of head) {
    const file = await thumbFile(result.thumbUrl, userAgent);
    if (file) {
      files.set(result.id, file);
    }
  }
  const measured = measureFiles([...new Set(files.values())]);
  const entries = new Map();
  for (const [id, file] of files) {
    const entry = measured.get(file);
    if (entry && !entry.error) {
      entries.set(id, {entry, file});
    }
  }
  return orderEntries(results, entries, query, core, style);
}
