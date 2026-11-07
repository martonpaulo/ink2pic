/**
 * Before page 1 shows: the thumbnails of pages 1 and 2 are downloaded to their files, measured
 * in Java, and those results re-sorted by their pixels (#66, research note
 * 2026-11-search-ranking section 7). A dark picture or a photo is turned into a contour drawing
 * on its thumbnail too, measured as converted, and inserted converted: what the person sees is
 * what goes in (owner decision D5 A). Bounded in time: what is not measured by then keeps its
 * place and its look. Every kind and time is logged.
 *
 * Page 3 and later: each thumbnail is measured, and converted when it needs it, as its page
 * loads, before the page shows; their order stays as it is (#72).
 */
import {log} from '../log/memory';
import {
  dropNearDuplicates,
  ImageAnalyzer,
  isFaintLines,
  isSpeckled,
  lineArt,
  MEASURED_RESULTS,
  Measures,
  needsContour,
  pixelKind,
  reorderByMeasures,
} from '../search-core';
import {thumbUri} from '../search/thumbs';
import {getSettings} from '../storage/settings';
import type {SearchResult} from '../search-core';
import {deviceAnalyzer} from '../storage/measures';

/**
 * At most this long for the downloads and measures, the grid's own limit for a page
 * (THUMB_TIMEOUT_MS): page 1 waits for pages 1 and 2 at most that long.
 */
export const MEASURE_LIMIT_MS = 8000;
/**
 * At most this long for a later page's measure and conversion, after its download, so the page
 * shows within the grid's limit (THUMB_TIMEOUT_MS). DEFAULT: TO TEST on the device.
 */
export const LATER_MEASURE_LIMIT_MS = 2000;
const FILE_PREFIX = 'file://';
/** The converted thumbnail, beside the stored one in the private folder, counted by its store. */
const CONTOUR_SUFFIX = '.contour.png';
/** A faint picture's darkened thumbnail (#81): not a contour drawing, so it inserts darkened too. */
const DARKENED_SUFFIX = '.dark.png';
/** Thumbnails come at 330 and 400 px; never scaled up. */
const CONTOUR_THUMB_WIDTH = 400;
const DIGITS = 2;

export type MeasuredPages = {
  results: SearchResult[];
  /** The measures the order used, by result id: of the converted thumbnail when converted. */
  measures: ReadonlyMap<string, Measures>;
  /**
   * Thumbnails shown prepared, result id to `file://` URI: as their contour drawing, or darkened
   * when faint (#81); `isContourUri` tells which.
   */
  contourThumbs: ReadonlyMap<string, string>;
};

export function unmeasured(results: SearchResult[]): MeasuredPages {
  return {results, measures: new Map(), contourThumbs: new Map()};
}

/** Whether the thumbnail at `uri` is a contour drawing: the picture is then inserted as one. */
export function isContourUri(uri: string): boolean {
  return uri.startsWith(FILE_PREFIX) && uri.endsWith(CONTOUR_SUFFIX);
}

/** What one thumbnail's measure found: the measures its order uses, and its contour drawing. */
type Measured = {measures: Measures; contour: string | null};

export type MeasureDeps = {
  analyzer: ImageAnalyzer;
  /** The thumbnail's URI: `file://<path>` once it is on the device. */
  thumb: (result: SearchResult, thumbDir: string) => Promise<string>;
  limitMs: number;
  /** The person's «All contour» style (#70): every measured thumbnail becomes a contour drawing. */
  allContour?: () => Promise<boolean>;
  /** The person's «Photos too» style (#70): the measured order ranks photos as drawings (#92). */
  photos?: () => Promise<boolean>;
};

const DEVICE: MeasureDeps = {
  analyzer: deviceAnalyzer,
  thumb: thumbUri,
  limitMs: MEASURE_LIMIT_MS,
  allContour: async () => (await getSettings()).style === 'contour',
  photos: async () => (await getSettings()).style === 'photos',
};

const LATER: MeasureDeps = {...DEVICE, limitMs: LATER_MEASURE_LIMIT_MS};

/** The work's value, or undefined once `ms` passed; the work itself is not stopped. */
async function withinLimit<T>(
  work: Promise<T>,
  ms: number,
): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<undefined>(resolve => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  const value = await Promise.race([work, timedOut]);
  clearTimeout(timer);
  return value;
}

/**
 * Measures the thumbnail at `uri` and converts it when `needsContour` says so; null when it is
 * not on the device or cannot be measured. A conversion is skipped once `late()` says the
 * result is no longer awaited: it would change nothing shown.
 */
async function measureFile(
  result: SearchResult,
  uri: string,
  deps: MeasureDeps,
  query: string,
  late: () => boolean = () => false,
  allContour = false,
): Promise<Measured | null> {
  if (!uri.startsWith(FILE_PREFIX)) {
    log(`pixels ${result.id}: not on the device, not measured`);
    return null;
  }
  const measured = await deps.analyzer.measure(uri.slice(FILE_PREFIX.length));
  if (!measured.ok) {
    log(`pixels ${result.id}: ${measured.message}`);
    return null;
  }
  const m = measured.value;
  log(
    `pixels ${result.id}: ${pixelKind(m)} lineArt ${lineArt(m).toFixed(
      DIGITS,
    )} in ${Math.round(m.ms)} ms`,
  );
  if (late()) {
    return {measures: m, contour: null};
  }
  if (!allContour && !needsContour(m, query)) {
    return isFaintLines(m)
      ? darkenFile(result, uri, deps, m)
      : {measures: m, contour: null};
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
    return {measures: m, contour: null};
  }
  const again = await deps.analyzer.measure(dest);
  log(
    `contour ${result.id}: ${Math.round(converted.value.ms)} ms, now ${
      again.ok ? pixelKind(again.value) : again.message
    }`,
  );
  if (again.ok && isSpeckled(again.value)) {
    // Mostly speckle: the picture is shown and inserted as it is (#83).
    log(`contour ${result.id}: speckled, shown as found`);
    return {measures: m, contour: null};
  }
  return {
    measures: again.ok ? again.value : m,
    contour: `${FILE_PREFIX}${dest}`,
  };
}

/**
 * Faint light-grey line work (#81): the tile shows it darkened, as the insert prepares it, and it
 * is measured again, so a picture still faint ranks after the clear ones.
 */
async function darkenFile(
  result: SearchResult,
  uri: string,
  deps: MeasureDeps,
  m: Measures,
): Promise<Measured> {
  if (!deps.analyzer.darken) {
    return {measures: m, contour: null};
  }
  const path = uri.slice(FILE_PREFIX.length);
  const dest = `${path}${DARKENED_SUFFIX}`;
  const darkened = await deps.analyzer.darken(path, dest, CONTOUR_THUMB_WIDTH);
  if (!darkened.ok) {
    log(`darken ${result.id}: ${darkened.message}`);
    return {measures: m, contour: null};
  }
  const again = await deps.analyzer.measure(dest);
  log(
    `darken ${result.id}: ${Math.round(darkened.value.ms)} ms, now ${
      again.ok ? pixelKind(again.value) : again.message
    }`,
  );
  return {
    measures: again.ok ? again.value : m,
    contour: `${FILE_PREFIX}${dest}`,
  };
}

/**
 * The URI a later page's tile shows (#72): its contour drawing when it needs one, else the
 * stored file, else the web URL. The measure and conversion take at most `deps.limitMs` after
 * the download; then the picture shows as found. Never rejects.
 */
export async function measureThumb(
  result: SearchResult,
  thumbDir: string,
  query: string,
  deps: MeasureDeps = LATER,
): Promise<string> {
  let uri = result.thumbUrl;
  try {
    uri = await deps.thumb(result, thumbDir);
    const contourAll = (await deps.allContour?.()) ?? false;
    let ended = false;
    const found = await withinLimit(
      measureFile(result, uri, deps, query, () => ended, contourAll),
      deps.limitMs,
    );
    ended = true;
    if (found === undefined) {
      log(`pixels ${result.id}: limit reached, shown as found`);
    }
    return found?.contour ?? uri;
  } catch (error) {
    log(`pixels ${result.id}: ${String(error)}`);
    return uri;
  }
}

/**
 * The results with pages 1 and 2 re-sorted by their pixels; unchanged without a thumbnail
 * folder. Never rejects: a failed download or measure leaves its result unmeasured.
 * `onThumbs` runs once every measured thumbnail is on the device (or failed), before the
 * limit: from then on a full download no longer holds a thumbnail back (#46, #88). It never
 * runs once the result is returned.
 */
export async function measureFirstPages(
  results: SearchResult[],
  thumbDir: string | null,
  query: string,
  deps: MeasureDeps = DEVICE,
  onThumbs?: () => void,
): Promise<MeasuredPages> {
  if (!thumbDir || results.length === 0) {
    return unmeasured(results);
  }
  const started = Date.now();
  const found = new Map<string, Measured>();
  const contourAll = (await deps.allContour?.()) ?? false;
  const photos = (await deps.photos?.()) ?? false;
  const firstPages = results.slice(0, MEASURED_RESULTS);
  const uris = firstPages.map(result => deps.thumb(result, thumbDir));
  let returned = false;
  Promise.allSettled(uris).then(() => {
    if (!returned) {
      onThumbs?.();
    }
  });
  const all = Promise.all(
    firstPages.map((result, index) =>
      uris[index]
        .then(uri =>
          measureFile(result, uri, deps, query, undefined, contourAll),
        )
        .then(measured => {
          if (measured) {
            found.set(result.id, measured);
          }
        })
        .catch(error => log(`pixels ${result.id}: ${String(error)}`)),
    ),
  );
  const late = (await withinLimit(all, deps.limitMs)) === undefined;
  returned = true;
  // Copies: a measure that ends after the limit changes nothing already shown.
  const used = new Map<string, Measures>();
  const contourThumbs = new Map<string, string>();
  for (const [id, measured] of found) {
    used.set(id, measured.measures);
    if (measured.contour) {
      contourThumbs.set(id, measured.contour);
    }
  }
  log(
    `pixels: ${used.size} of ${Math.min(
      results.length,
      MEASURED_RESULTS,
    )} measured in ${Date.now() - started} ms${late ? ', limit reached' : ''}`,
  );
  // Shown as their contour drawing: they follow the pictures shown as found (#83).
  const converted = new Set(
    [...contourThumbs].filter(([, uri]) => isContourUri(uri)).map(([id]) => id),
  );
  const ordered = reorderByMeasures(results, used, query, converted, photos);
  const distinct = dropNearDuplicates(ordered, used);
  if (distinct.length < ordered.length) {
    log(`pixels: ${ordered.length - distinct.length} near-duplicates left out`);
  }
  return {
    results: distinct,
    measures: used,
    contourThumbs,
  };
}
