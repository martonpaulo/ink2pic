/**
 * Before page 1 shows: the thumbnails of pages 1 and 2 are downloaded to their files, measured
 * in Java, and those results re-sorted by their pixels (#66, research note
 * 2026-11-search-ranking section 7). A dark picture or a photo is turned into a contour drawing
 * on its thumbnail too, measured as converted, and inserted converted: what the person sees is
 * what goes in (owner decision D5 A). Bounded in time: what is not measured by then keeps its
 * place and its look. Every kind and time is logged.
 *
 * shortcut: pages 3 and later are neither measured nor converted; upgrade when the grid measures
 * each later page as it loads.
 */
import {log} from '../log/memory';
import {
  ImageAnalyzer,
  lineArt,
  MEASURED_RESULTS,
  Measures,
  needsContour,
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
/** The converted thumbnail, beside the stored one in the private folder, counted by its store. */
const CONTOUR_SUFFIX = '.contour.png';
/** Thumbnails come at 330 and 400 px; never scaled up. */
const CONTOUR_THUMB_WIDTH = 400;
const DIGITS = 2;

export type MeasuredPages = {
  results: SearchResult[];
  /** The measures the order used, by result id: of the converted thumbnail when converted. */
  measures: ReadonlyMap<string, Measures>;
  /** Thumbnails shown as their contour drawing: result id to `file://` URI. */
  contourThumbs: ReadonlyMap<string, string>;
};

export function unmeasured(results: SearchResult[]): MeasuredPages {
  return {results, measures: new Map(), contourThumbs: new Map()};
}

/** Whether the picture is inserted as a contour drawing: its thumbnail shows one. */
export function insertsContour(pages: MeasuredPages, id: string): boolean {
  return pages.contourThumbs.has(id);
}

type Found = {
  measures: Map<string, Measures>;
  contourThumbs: Map<string, string>;
};

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
  query: string,
  into: Found,
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
  if (!needsContour(m, query)) {
    into.measures.set(result.id, m);
    return;
  }
  const path = uri.slice(FILE_PREFIX.length);
  const dest = `${path}${CONTOUR_SUFFIX}`;
  const converted = await deps.analyzer.toContour(
    path,
    dest,
    CONTOUR_THUMB_WIDTH,
  );
  if (!converted.ok) {
    // Shown and inserted as it is: the grid never shows what is not inserted.
    log(`contour ${result.id}: ${converted.message}`);
    into.measures.set(result.id, m);
    return;
  }
  const again = await deps.analyzer.measure(dest);
  log(
    `contour ${result.id}: ${Math.round(converted.value.ms)} ms, now ${
      again.ok ? pixelKind(again.value) : again.message
    }`,
  );
  into.measures.set(result.id, again.ok ? again.value : m);
  into.contourThumbs.set(result.id, `${FILE_PREFIX}${dest}`);
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
  const found: Found = {measures: new Map(), contourThumbs: new Map()};
  const all = Promise.all(
    results
      .slice(0, MEASURED_RESULTS)
      .map(result =>
        measureOne(result, thumbDir, deps, query, found).catch(error =>
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
  // Copies: a measure that ends after the limit changes nothing already shown.
  const used = new Map(found.measures);
  const contourThumbs = new Map(found.contourThumbs);
  log(
    `pixels: ${used.size} of ${Math.min(
      results.length,
      MEASURED_RESULTS,
    )} measured in ${Date.now() - started} ms${late ? ', limit reached' : ''}`,
  );
  return {
    results: reorderByMeasures(results, used, query),
    measures: used,
    contourThumbs,
  };
}
