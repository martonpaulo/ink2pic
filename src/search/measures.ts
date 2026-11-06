/**
 * Pixel measures of a thumbnail and what they say about it (#66; research note
 * 2026-11-search-ranking sections 3, 4 and 7, and research D on iconic pictures). Portable core:
 * no React Native, no SDK; the measuring itself sits behind `ImageAnalyzer`, which the device
 * implements in `src/storage/measures.ts` and another project can supply.
 */
import type {Result} from '../sdk/result';
import {PAGE_SIZE, SearchResult} from '../search-core';
import {einkScore} from '../search-core/rank';

/**
 * The features `ThumbMeasures.java` computes on gray values flattened on white. Shares are 0 to 1,
 * grays 0 to 255, the ink box in pixels; `ms` is the decode and measure time.
 */
export type Measures = {
  width: number;
  height: number;
  mean: number;
  dark: number;
  white: number;
  mid: number;
  /** White share of the outer 5 % frame. */
  border: number;
  /** Median gray of that frame: the background. */
  borderMedian: number;
  /** Share of pixels darker than the background by 48 grays. */
  ink: number;
  inkLeft: number;
  inkTop: number;
  inkWidth: number;
  inkHeight: number;
  /** Lines of ink in the ink box (horizontal projection). */
  bands: number;
  /** Ink box width over one band's height: high for writing. */
  lineAspect: number;
  /** Ink pixels per boundary ink pixel: a stroke-width estimate. */
  thickness: number;
  /** Share of Sobel edge pixels. */
  edge: number;
  /** Area share of the box holding 98 % of the edge energy per axis (Ke 2006). */
  edgeBox: number;
  /** Distinct 12-bit colours. */
  colours: number;
  /** Share of pixels that differ from the background. */
  objectShare: number;
  ms: number;
};

/** A picture file written by `toContour`: its size and the time it took. */
export type ConvertedImage = {width: number; height: number; ms: number};

/** Measures and converts picture files; the device's is the plugin's Java module. */
export type ImageAnalyzer = {
  measure: (path: string) => Promise<Result<Measures>>;
  /** Writes `dest` as a contour drawing of `src`, scaled down to `width` (never up). */
  toContour: (
    src: string,
    dest: string,
    width: number,
  ) => Promise<Result<ConvertedImage>>;
};

/**
 * What a thumbnail looks like, for the log and for the contour conversion. Thresholds are the
 * research's starting values, fitted on 28 thumbnails [INFERENCE beyond them].
 */
export type PixelKind =
  | 'blank'
  | 'dark'
  | 'photo'
  | 'text'
  | 'faint'
  | 'outline'
  | 'clean'
  | 'plain';

/** Below this object share the thumbnail shows nothing: white on transparent, or empty. */
const BLANK_OBJECT = 0.005;
const DARK_MEAN = 100;
/** Under this border white share the picture fills its frame: a photo or a painting. */
const FILLED_BORDER = 0.3;
const PHOTO_MID = 0.4;
/** From this border white share the subject stands on clean paper. */
const CLEAN_BORDER = 0.85;
const TEXT_INK = 0.25;
const TEXT_LINE_ASPECT = 2.5;
const FAINT_INK = 0.01;
const FAINT_WHITE = 0.9;
const OUTLINE_WHITE = 0.6;
const OUTLINE_DARK = 0.2;

function isFaint(m: Measures): boolean {
  return m.ink < FAINT_INK && m.white > FAINT_WHITE;
}

export function pixelKind(m: Measures): PixelKind {
  if (m.objectShare < BLANK_OBJECT) {
    return 'blank';
  }
  if (m.mean < DARK_MEAN && m.border < FILLED_BORDER) {
    return 'dark';
  }
  if (m.border < FILLED_BORDER && m.mid >= PHOTO_MID) {
    return 'photo';
  }
  const clean = m.border >= CLEAN_BORDER;
  if (clean && m.ink < TEXT_INK && m.lineAspect >= TEXT_LINE_ASPECT) {
    return 'text';
  }
  if (isFaint(m)) {
    return 'faint';
  }
  if (clean && m.white >= OUTLINE_WHITE && m.dark <= OUTLINE_DARK) {
    return 'outline';
  }
  return clean ? 'clean' : 'plain';
}

/** The person asked for line work: every picture that is not already line work is converted. */
const OUTLINE_QUERY =
  /\b(outlines?|drawings?|line ?art|contours?|colou?ring( page)?s?|sketch(es)?)\b/i;
/** The person asked for the tones themselves: nothing is converted (research section 6, rule 3). */
const TONES_QUERY = /\b(photos?|photographs?|paintings?)\b/i;
const CONVERTED: ReadonlySet<PixelKind> = new Set(['dark', 'photo']);
const ALREADY_LINES: ReadonlySet<PixelKind> = new Set([
  'outline',
  'text',
  'faint',
  'blank',
]);

/**
 * Whether the picture is shown and inserted as a contour drawing (owner decision D5 A): a dark
 * picture or a photo, or any picture not already line work when the query asks for an outline;
 * never when the query asks for a photo or a painting.
 */
export function needsContour(m: Measures, query: string): boolean {
  if (TONES_QUERY.test(query)) {
    return false;
  }
  const kind = pixelKind(m);
  return (
    CONVERTED.has(kind) ||
    (OUTLINE_QUERY.test(query) && !ALREADY_LINES.has(kind))
  );
}

/** The weights of the line-art score (research D, section 3). */
const LINE_ART = {
  lowMid: 0.3,
  white: 0.2,
  fewColours: 0.15,
  tightEdges: 0.15,
  outline: 0.2,
  solid: -0.2,
  faint: -0.2,
};
/** log2 of the colour count: 8 colours or fewer score 0, 1024 or more score 1. */
const FEW_COLOURS_LOG2 = 3;
const MANY_COLOURS_LOG2 = 10;
/** A thin-stroke outline: this much ink, in strokes this thick (ink per boundary pixel). */
const OUTLINE_INK_MIN = 0.01;
const OUTLINE_INK_MAX = 0.3;
const THIN_STROKE = 4;
const MEDIUM_STROKE = 8;
const HALF = 0.5;
/** A solid fill: much ink in thick areas, hard to annotate. */
const SOLID_INK = 0.25;
const SOLID_STROKE = 15;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function outlineTerm(m: Measures): number {
  if (m.ink < OUTLINE_INK_MIN || m.ink > OUTLINE_INK_MAX) {
    return 0;
  }
  return m.thickness <= THIN_STROKE
    ? 1
    : m.thickness <= MEDIUM_STROKE
    ? HALF
    : 0;
}

/**
 * How much the thumbnail looks like clean line art that prints well on e-ink: few mid grays,
 * white paper, few colours, edges in a tight box, thin strokes; minus solid fills and faint lines.
 */
export function lineArt(m: Measures): number {
  const colours = clamp01(
    (Math.log2(Math.max(1, m.colours)) - FEW_COLOURS_LOG2) /
      (MANY_COLOURS_LOG2 - FEW_COLOURS_LOG2),
  );
  const solid = m.ink > SOLID_INK && m.thickness > SOLID_STROKE ? 1 : 0;
  return (
    LINE_ART.lowMid * (1 - m.mid) +
    LINE_ART.white * m.white +
    LINE_ART.fewColours * (1 - colours) +
    LINE_ART.tightEdges * (1 - m.edgeBox) +
    LINE_ART.outline * outlineTerm(m) +
    LINE_ART.solid * solid +
    LINE_ART.faint * (isFaint(m) ? 1 : 0)
  );
}

/** Pages 1 and 2: their thumbnails are on the device before page 1 shows (research section 7). */
export const MEASURED_RESULTS = 2 * PAGE_SIZE;
/** `einkScore + 3 x lineArt`, lineArt scaled 0 to 1 within the measured thumbnails (research D). */
const LINE_ART_WEIGHT = 3;
/**
 * shortcut: a thumbnail that could not be measured scores the middle of the scale, so a failed
 * measure neither lifts nor buries it; upgrade when the search lab shows a better default.
 */
const UNMEASURED = 0.5;

/** A ranking signal: a pure function of one result. */
export type Scorer = (result: SearchResult) => number;

/**
 * The pixel signal over one set of measures: `3 x lineArt`, min-max scaled within the set, so it
 * moves pictures only relative to each other. A canonical picture scores 0: it keeps its place.
 */
export function pixelScorer(measures: ReadonlyMap<string, Measures>): Scorer {
  const scores = new Map<string, number>();
  for (const [id, m] of measures) {
    if (pixelKind(m) !== 'blank') {
      scores.set(id, lineArt(m));
    }
  }
  const values = [...scores.values()];
  const low = Math.min(...values);
  const range = Math.max(...values) - low;
  return result => {
    if (result.canonical) {
      return 0;
    }
    const score = scores.get(result.id);
    const scaled =
      score === undefined
        ? UNMEASURED
        : range > 0
        ? (score - low) / range
        : HALF;
    return LINE_ART_WEIGHT * scaled;
  };
}

function isBlank(
  result: SearchResult,
  measures: ReadonlyMap<string, Measures>,
): boolean {
  const m = measures.get(result.id);
  return !result.canonical && m !== undefined && pixelKind(m) === 'blank';
}

/**
 * Re-sorts the first MEASURED_RESULTS results by `einkScore + pixelScorer`; ties keep their
 * order. A canonical Wikidata picture keeps its index (brief section 5.5, rule 4). A blank
 * thumbnail goes to the end of the list; the next result fills its place. Later results keep
 * their order.
 */
export function reorderByMeasures(
  results: readonly SearchResult[],
  measures: ReadonlyMap<string, Measures>,
  query = '',
): SearchResult[] {
  if (measures.size === 0) {
    return [...results];
  }
  const head = results.slice(0, MEASURED_RESULTS);
  const pixels = pixelScorer(measures);
  const blank = head.filter(result => isBlank(result, measures));
  const sorted = head
    .filter(result => !result.canonical && !isBlank(result, measures))
    .map((result, order) => ({
      result,
      order,
      score: einkScore(result, query) + pixels(result),
    }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(entry => entry.result);
  const queue = [...sorted, ...results.slice(MEASURED_RESULTS)];
  const ordered: SearchResult[] = [];
  for (const result of head) {
    // Each other slot takes the next sorted result, or a later one when blanks left.
    const next = result.canonical ? result : queue.shift();
    if (next) {
      ordered.push(next);
    }
  }
  return [...ordered, ...queue, ...blank];
}
