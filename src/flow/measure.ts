/**
 * Before page 1 shows: the thumbnails of pages 1 and 2 are downloaded to their files, measured
 * in Java, and those results re-sorted by their pixels (#66, research note
 * 2026-11-search-ranking section 7). Bounded in time: what is not measured by then keeps its
 * place. Every kind and time is logged.
 */
import {log} from '../log/memory';
import {
  ImageAnalyzer,
  lineArt,
  MEASURED_RESULTS,
  Measures,
  pixelKind,
  reorderByMeasures,
} from '../search/measures';
import {thumbUri} from '../search/thumbs';
import type {SearchResult} from '../sources/types';
import {deviceAnalyzer} from '../storage/measures';

/**
 * At most this long for the downloads and measures, the grid's own limit for a page
 * (THUMB_TIMEOUT_MS): page 1 waits for pages 1 and 2 at most that long.
 */
export const MEASURE_LIMIT_MS = 8000;
const FILE_PREFIX = 'file://';
const DIGITS = 2;

export type MeasuredPages = {
  results: SearchResult[];
  /** The measures the order used, by result id. */
  measures: ReadonlyMap<string, Measures>;
};

export function unmeasured(results: SearchResult[]): MeasuredPages {
  return {results, measures: new Map()};
}

export type MeasureDeps = {
  analyzer: ImageAnalyzer;
  /** The thumbnail's URI: `file://<path>` once it is on the device. */
  thumb: (result: SearchResult, thumbDir: string) => Promise<string>;
  limitMs: number;
};

const DEVICE: MeasureDeps = {
  analyzer: deviceAnalyzer,
  thumb: thumbUri,
  limitMs: MEASURE_LIMIT_MS,
};

async function measureOne(
  result: SearchResult,
  thumbDir: string,
  deps: MeasureDeps,
  into: Map<string, Measures>,
): Promise<void> {
  const uri = await deps.thumb(result, thumbDir);
  if (!uri.startsWith(FILE_PREFIX)) {
    log(`pixels ${result.id}: not on the device, not measured`);
    return;
  }
  const measured = await deps.analyzer.measure(uri.slice(FILE_PREFIX.length));
  if (!measured.ok) {
    log(`pixels ${result.id}: ${measured.message}`);
    return;
  }
  const m = measured.value;
  log(
    `pixels ${result.id}: ${pixelKind(m)} lineArt ${lineArt(m).toFixed(
      DIGITS,
    )} in ${Math.round(m.ms)} ms`,
  );
  into.set(result.id, m);
}

/**
 * The results with pages 1 and 2 re-sorted by their pixels; unchanged without a thumbnail
 * folder. Never rejects: a failed download or measure leaves its result unmeasured.
 */
export async function measureFirstPages(
  results: SearchResult[],
  thumbDir: string | null,
  query: string,
  deps: MeasureDeps = DEVICE,
): Promise<MeasuredPages> {
  if (!thumbDir || results.length === 0) {
    return unmeasured(results);
  }
  const started = Date.now();
  const measures = new Map<string, Measures>();
  const all = Promise.all(
    results
      .slice(0, MEASURED_RESULTS)
      .map(result =>
        measureOne(result, thumbDir, deps, measures).catch(error =>
          log(`pixels ${result.id}: ${String(error)}`),
        ),
      ),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<boolean>(resolve => {
    timer = setTimeout(() => resolve(true), deps.limitMs);
  });
  const late = await Promise.race([all.then(() => false), timedOut]);
  clearTimeout(timer);
  // A copy: a measure that ends after the limit changes nothing already shown.
  const used = new Map(measures);
  log(
    `pixels: ${used.size} of ${Math.min(
      results.length,
      MEASURED_RESULTS,
    )} measured in ${Date.now() - started} ms${late ? ', limit reached' : ''}`,
  );
  return {results: reorderByMeasures(results, used, query), measures: used};
}
