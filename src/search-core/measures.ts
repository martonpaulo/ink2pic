/**
 * Pixel measures of a thumbnail and what they say about it (#66; research note
 * 2026-11-search-ranking sections 3, 4 and 7, and research D on iconic pictures). The measuring
 * itself sits behind `ImageAnalyzer`, which the device implements in `src/storage/measures.ts`
 * and another project can supply; `pixelScorer` is one more `Scorer` of the ranker.
 */
import {readIntent} from './query';
import {DEFAULT_SCORERS, intentFor, PHOTO_SCORERS, Scorer, total} from './rank';
import {PAGE_SIZE, SearchResult} from './types';

/** What an analyzer call gives: the value, or why there is none, for the log. */
export type Measured<T> = {ok: true; value: T} | {ok: false; message: string};

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
  /** Perceptual hash, 48 hex digits (`PerceptualHash.java`, #89); absent from an older module. */
  hash?: string;
  /** Share of the ink in short parts, under 10 % of the longer side: texture and speckle (#83). */
  fragments: number;
  /** The darkest ink's gray, 255 without ink: light grey for faint line work (#81). */
  darkest: number;
  /** Thin light-grey lines on paper, by `EinkPixels.isFaintLines`: the insert darkens them (#81). */
  faintLines: boolean;
  ms: number;
};

/** A picture file written by `toContour`: its size and the time it took. */
export type ConvertedImage = {width: number; height: number; ms: number};

/** Measures and converts picture files; the device's is the plugin's Java module. */
export type ImageAnalyzer = {
  measure: (path: string) => Promise<Measured<Measures>>;
  /** Writes `dest` as a contour drawing of `src`, scaled down to `width` (never up). */
  toContour: (
    src: string,
    dest: string,
    width: number,
  ) => Promise<Measured<ConvertedImage>>;
  /**
   * Writes `dest` as the picture prepared for e-ink without a contour, faint lines darkened
   * (#81), as the insert prepares it; without it, a faint picture shows as found.
   */
  darken?: (
    src: string,
    dest: string,
    width: number,
  ) => Promise<Measured<ConvertedImage>>;
};

/**
 * What a thumbnail looks like, for the log and for the contour conversion. Thresholds are the
 * research's starting values, fitted on 28 thumbnails [INFERENCE beyond them].
 */
export type PixelKind =
  | 'blank'
  | 'dark'
  | 'solid'
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
/**
 * From this share of dark pixels a picture on paper reads as a black block on e-ink: a
 * silhouette, a dark shaded or gradient clip art (#81). Measured in the search lab on 652
 * thumbnails of its cases (2026-11-07): from 0.3 every picture is a heavy black area and its
 * contour drawing a clean outline; below it sits thick line art (clocks, bicycles), whose contour
 * only doubles its lines.
 */
const DARK_CLIPART = 0.3;
/** A solid fill: much ink in thick areas, hard to annotate (research D); a silhouette below 0.3. */
const SOLID_INK = 0.25;
const SOLID_STROKE = 15;

function isFaint(m: Measures): boolean {
  return m.ink < FAINT_INK && m.white > FAINT_WHITE;
}

function isSolid(m: Measures): boolean {
  return m.ink > SOLID_INK && m.thickness > SOLID_STROKE;
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
  if (m.dark >= DARK_CLIPART || isSolid(m)) {
    return 'solid';
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

const CONVERTED: ReadonlySet<PixelKind> = new Set(['dark', 'photo', 'solid']);
const ALREADY_LINES: ReadonlySet<PixelKind> = new Set([
  'outline',
  'text',
  'faint',
  'blank',
]);

/**
 * Whether the picture is shown and inserted as a contour drawing (owner decision D5 A): a dark
 * picture, a photo or dark clip art on paper (#81), or any picture not already line work when
 * the query asks for an outline; never when the query asks for a photo or a painting, and never
 * for a few flat areas.
 */
export function needsContour(m: Measures, query: string): boolean {
  // The query's style words are read once, by the query pipeline (#65).
  const {styles} = readIntent(query);
  if (styles.has('photo') || styles.has('painting') || isFlat(m)) {
    return false;
  }
  const kind = pixelKind(m);
  return (
    CONVERTED.has(kind) || (styles.has('drawing') && !ALREADY_LINES.has(kind))
  );
}

/**
 * A picture of a few large flat areas of grey: a flag, clip art with solid colour fills. The
 * contour turns each flat area white and keeps only its borders, the «white box with two lines»
 * the flag of Spain became on build 15, so it keeps its grey (#89). In the search lab's 560
 * thumbnails the contour would convert, every one with at most 64 colours, under 10 % edges and
 * 20 % mid greys or more was a flag, a sign or colour clip art whose contour lost it; the one-tone
 * silhouettes, under 5 % mid greys, keep their clean outline (#81).
 */
const FLAT_COLOURS = 64;
const FLAT_EDGE = 0.1;
const FLAT_MID = 0.2;

export function isFlat(m: Measures): boolean {
  return m.colours <= FLAT_COLOURS && m.edge < FLAT_EDGE && m.mid >= FLAT_MID;
}

/**
 * A contour drawing that is mostly speckle: much of its ink in short fragments (texture, foliage,
 * water, fine hatching) or ink over much of it (a crowd). Its picture then shows as it is (#83).
 * Set in the search lab on 72 converted thumbnails with the cleaned contour (2026-11-07): every
 * drawing the owner would call speckled was over one of the two, the portraits and silhouettes
 * under both, except a light bust photo at 0.47 fragments.
 */
const SPECKLED_FRAGMENTS = 0.35;
const SPECKLED_INK = 0.4;

export function isSpeckled(contour: Measures): boolean {
  return contour.fragments >= SPECKLED_FRAGMENTS || contour.ink >= SPECKLED_INK;
}

/**
 * Whether the picture is faint line work on paper, which the insert darkens (#81). The rule is the
 * native one, `EinkPixels.isFaintLines`, which darkens it: one owner.
 */
export function isFaintLines(m: Measures): boolean {
  return m.faintLines;
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
  const solid = isSolid(m) ? 1 : 0;
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
/**
 * Below every picture shown as found: a photo or painting shown as its contour drawing. A real
 * line drawing or vector picture comes first (#83, owner: «não tem imagem tipo mais limpa?»).
 */
const CONVERTED_SCALE = -1;
/**
 * Below the contour drawings: a picture of mostly large text, a quote poster (#83), and faint
 * line work not darkened or still faint once darkened, its lines too thin for e-ink (#81).
 */
const LAST_SCALE = -2;

/**
 * The pixel signal over one set of measures: `3 x lineArt`, min-max scaled within the set, so it
 * moves pictures only relative to each other. A canonical picture scores 0: it keeps its place.
 * `converted` names the pictures shown as their contour drawing.
 */
export function pixelScorer(
  measures: ReadonlyMap<string, Measures>,
  converted: ReadonlySet<string> = new Set(),
): Scorer {
  const scores = new Map<string, number>();
  const fixed = new Map<string, number>();
  for (const [id, m] of measures) {
    const kind = pixelKind(m);
    if (isFaintLines(m) || kind === 'faint' || kind === 'text') {
      fixed.set(id, LAST_SCALE);
    } else if (converted.has(id)) {
      fixed.set(id, CONVERTED_SCALE);
    } else if (kind !== 'blank') {
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
    const set = fixed.get(result.id);
    if (set !== undefined) {
      return LINE_ART_WEIGHT * set;
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

/**
 * Whether the picture leaves pages 1 and 2: a blank thumbnail, or one shown near-black, such as
 * a dark poster or a dark canonical photo whose contour was mostly speckle (#83), unless the
 * query asks for a photo or a painting. A blank canonical picture stays.
 */
function isLeft(
  result: SearchResult,
  measures: ReadonlyMap<string, Measures>,
  query: string,
): boolean {
  const m = measures.get(result.id);
  if (m === undefined) {
    return false;
  }
  const kind = pixelKind(m);
  const {styles} = readIntent(query);
  return (
    (kind === 'blank' && !result.canonical) ||
    (kind === 'dark' && !styles.has('photo') && !styles.has('painting'))
  );
}

/**
 * Re-sorts the first MEASURED_RESULTS results by `einkScore + pixelScorer`; ties keep their
 * order. A canonical Wikidata picture keeps its index (brief section 5.5, rule 4), unless it is
 * shown near-black. A blank or near-black thumbnail goes to the end of the list; the next result fills its place. Later
 * results keep their order. `converted` names the pictures shown as their contour drawing.
 * `photos` is the person's «Photos too» style (#70): the same scorers as the search then (#92).
 */
export function reorderByMeasures(
  results: readonly SearchResult[],
  measures: ReadonlyMap<string, Measures>,
  query = '',
  converted: ReadonlySet<string> = new Set(),
  photos = false,
): SearchResult[] {
  if (measures.size === 0) {
    return [...results];
  }
  const head = results.slice(0, MEASURED_RESULTS);
  const pixels = pixelScorer(measures, converted);
  const intent = intentFor(query, results);
  const blank = head.filter(result => isLeft(result, measures, query));
  const sorted = head
    .filter(result => !result.canonical && !isLeft(result, measures, query))
    .map((result, order) => ({
      result,
      order,
      score: total(result, intent, [
        ...(photos ? PHOTO_SCORERS : DEFAULT_SCORERS),
        pixels,
      ]),
    }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(entry => entry.result);
  const queue = [...sorted, ...results.slice(MEASURED_RESULTS)];
  const ordered: SearchResult[] = [];
  for (const result of head) {
    // Each other slot takes the next sorted result, or a later one when blanks left.
    const keeps = result.canonical && !isLeft(result, measures, query);
    const next = keeps ? result : queue.shift();
    if (next) {
      ordered.push(next);
    }
  }
  return [...ordered, ...queue, ...blank];
}
