/**
 * Which strokes are «the word» the person means (#75): pure rules over the page's strokes, in
 * Android page pixels (docs.supernote.com, Coordinate System). Two rules:
 *
 * - circle: the last stroke is a closed loop drawn around earlier strokes; the word is the strokes
 *   inside it (the owner's flow, 2026-11-06);
 * - last word: by position only. Walk back by numInPage while the strokes sit on the same line;
 *   group that line's letters into words by its own gaps; take the word of the newest letter, with
 *   its dots, accents and bars.
 *
 * Every threshold is a ratio to a measure of the line itself, so the rule fits each person's
 * handwriting (owner, 2026-11-07); the Word spacing setting scales the word gap. Pen-up times are
 * not used: on the device, gaps inside a word (130–656 ms) and between words (578–1122 ms) overlap.
 * The ratios are tuned on one device phrase [INFERENCE]; the probe logs every stroke of the line.
 */

export type Point = {x: number; y: number};
export type Rect = {left: number; top: number; right: number; bottom: number};
export type PageSize = {width: number; height: number};

/** One stroke of the page: its numInPage, the page's writing order, and its sample points. */
export type PageStroke = {num: number; points: Point[]};

export type WordRule = 'circle' | 'last word' | 'last words';

/** What the rule made of one stroke: a letter on the line, a mark above it, or another line. */
export type StrokePart = 'letter' | 'mark' | 'other line';
export type StrokeVerdict = {
  num: number;
  rect: Rect;
  part: StrokePart;
  kept: boolean;
};

/** The line's own measures, in page pixels: they set the word gap and the lasso's padding. */
export type LineMeasures = {height: number; letterGap: number; wordGap: number};

export type WordChoice = {
  rule: WordRule;
  /** The rect to lasso: the word padded, within the page. */
  rect: Rect;
  strokes: number;
  /** Every stroke the rule weighed, oldest first. */
  verdicts: StrokeVerdict[];
  measures: LineMeasures;
};

/** A loop is closed when its ends are this near, as a share of its larger side. */
export const CLOSE_SHARE = 0.25;
/** Fewer sample points than this is a dot or a dash, never a circle. */
export const LOOP_MIN_POINTS = 12;
/** A stroke is inside the circle when at least this share of its points is. */
export const INSIDE_SHARE = 0.8;
/**
 * A stroke is a letter of the line when its vertical overlap with the line's band is at least
 * this share of the lower of the two heights: a tall «C», «f» or «h» overlaps the whole band.
 */
export const LINE_OVERLAP_SHARE = 0.3;
/** Shorter than this share of the band, a stroke is a mark: an i-dot, an accent, a bar. */
export const MARK_SHARE = 0.6;
/** A mark above the band belongs to the line when its bottom is within this many band heights. */
export const MARK_REACH = 1;
/** The smallest word gap, as a share of the line's median letter height. */
export const WORD_GAP_SHARE = 0.8;
/** A word gap is at least this many times the line's median gap between letters. */
export const LETTER_GAP_RATIO = 3;
/** Margin around the word before it is lassoed, as a share of the line's letter height. */
export const LASSO_MARGIN_SHARE = 0.25;
/**
 * The lasso's smallest side, as a share of the letter height: lassoElements answered false for a
 * 53 × 52 rect and true for 88 × 52 (build 15) [TO TEST, brief section 10.5].
 */
export const LASSO_MIN_SHARE = 2.5;

type Measured = {num: number; rect: Rect};

export function boundsOf(points: Point[]): Rect | null {
  if (points.length === 0) {
    return null;
  }
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

function union(rects: Rect[]): Rect | null {
  if (rects.length === 0) {
    return null;
  }
  return {
    left: Math.min(...rects.map(rect => rect.left)),
    top: Math.min(...rects.map(rect => rect.top)),
    right: Math.max(...rects.map(rect => rect.right)),
    bottom: Math.max(...rects.map(rect => rect.bottom)),
  };
}

function height(rect: Rect): number {
  return rect.bottom - rect.top;
}

/** The middle value; the mean of the two middle ones for an even count; 0 for none. */
export function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function measure(strokes: PageStroke[]): Measured[] {
  return strokes
    .flatMap(stroke => {
      const rect = boundsOf(stroke.points);
      return rect === null ? [] : [{num: stroke.num, rect}];
    })
    .sort((a, b) => a.num - b.num);
}

/** A stroke whose two ends meet, relative to its size: a circle, an ellipse or a loop. */
export function isClosedLoop(points: Point[]): boolean {
  const rect = boundsOf(points);
  if (rect === null || points.length < LOOP_MIN_POINTS) {
    return false;
  }
  const side = Math.max(rect.right - rect.left, height(rect));
  const first = points[0];
  const last = points[points.length - 1];
  const ends = Math.hypot(last.x - first.x, last.y - first.y);
  return side > 0 && ends <= side * CLOSE_SHARE;
}

/** Ray casting over the loop as a polygon. */
export function insideLoop(point: Point, loop: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i];
    const b = loop[j];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function isInside(stroke: PageStroke, loop: Point[]): boolean {
  const inside = stroke.points.filter(point => insideLoop(point, loop));
  return (
    stroke.points.length > 0 &&
    inside.length >= stroke.points.length * INSIDE_SHARE
  );
}

/** The strokes that lie inside the loop, by the share of their points. */
export function strokesInside(
  strokes: PageStroke[],
  loop: Point[],
): PageStroke[] {
  return strokes.filter(stroke => isInside(stroke, loop));
}

/** The band of a line: the median top and bottom of its letters, so one tall letter moves little. */
function bandOf(letters: Rect[]): Rect {
  return {
    left: Math.min(...letters.map(rect => rect.left)),
    right: Math.max(...letters.map(rect => rect.right)),
    top: median(letters.map(rect => rect.top)),
    bottom: median(letters.map(rect => rect.bottom)),
  };
}

function partOf(rect: Rect, band: Rect): StrokePart {
  const bandHeight = Math.max(height(band), 1);
  const overlap =
    Math.min(rect.bottom, band.bottom) - Math.max(rect.top, band.top);
  if (
    overlap >=
    Math.max(Math.min(height(rect), bandHeight), 1) * LINE_OVERLAP_SHARE
  ) {
    return 'letter';
  }
  const small = height(rect) < bandHeight * MARK_SHARE;
  const above =
    rect.bottom <= band.top && rect.bottom >= band.top - bandHeight * MARK_REACH;
  return small && above ? 'mark' : 'other line';
}

function horizontalGap(a: Rect, b: Rect): number {
  return Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
}

/** Letters side by side, overlapping or touching in x, merged left to right. */
function clusters(letters: Measured[]): Measured[][] {
  const sorted = [...letters].sort((a, b) => a.rect.left - b.rect.left);
  const groups: {right: number; members: Measured[]}[] = [];
  for (const letter of sorted) {
    const last = groups[groups.length - 1];
    if (last && letter.rect.left <= last.right) {
      last.members.push(letter);
      last.right = Math.max(last.right, letter.rect.right);
    } else {
      groups.push({right: letter.rect.right, members: [letter]});
    }
  }
  return groups.map(group => group.members);
}

function boundsOfAll(members: Measured[]): Rect {
  return union(members.map(member => member.rect)) as Rect;
}

/** The line's measures from its letters' heights and gaps; `spacing` scales the word gap. */
export function lineMeasures(
  heights: number[],
  gaps: number[],
  spacing: number,
): LineMeasures {
  const letterHeight = median(heights);
  const floor = letterHeight * WORD_GAP_SHARE;
  const letterGap = median(gaps.filter(gap => gap < floor));
  return {
    height: letterHeight,
    letterGap,
    wordGap: spacing * Math.max(floor, letterGap * LETTER_GAP_RATIO),
  };
}

/** The strokes of the newest line, by numInPage, ending at the first stroke of another line. */
function newestLine(measured: Measured[]): {
  line: Measured[];
  band: Rect;
  end: Measured | null;
} {
  const heights = measured.map(stroke => height(stroke.rect));
  const typical = median(heights);
  let seed = measured.length - 1;
  while (seed > 0 && heights[seed] < typical * MARK_SHARE) {
    seed--;
  }
  const letters = [measured[seed].rect];
  let first = seed;
  let end: Measured | null = null;
  for (let i = seed - 1; i >= 0; i--) {
    const part = partOf(measured[i].rect, bandOf(letters));
    if (part === 'other line') {
      end = measured[i];
      break;
    }
    if (part === 'letter') {
      letters.push(measured[i].rect);
    }
    first = i;
  }
  return {line: measured.slice(first), band: bandOf(letters), end};
}

/** The newest line split into words, left to right, up to the word of the newest letter (#87). */
export type LineWords = {
  /** Each word's strokes by numInPage, marks included; the last one is the last word. */
  words: number[][];
  verdicts: StrokeVerdict[];
  measures: LineMeasures;
};

/**
 * The last word by position: the newest line's letters grouped into words by the line's own word
 * gap; the word of the newest letter, with each mark that lies nearer to it than to another word.
 */
export function lastWord(
  strokes: PageStroke[],
  spacing: number,
): {kept: number[]; verdicts: StrokeVerdict[]; measures: LineMeasures} | null {
  const line = lineWords(strokes, spacing);
  return line === null
    ? null
    : {
        kept: line.words[line.words.length - 1],
        verdicts: line.verdicts,
        measures: line.measures,
      };
}

/**
 * The newest line's words up to the last word (#87): the same grouping, with each mark given to
 * the word it lies nearest, within the word gap.
 */
export function lineWords(
  strokes: PageStroke[],
  spacing: number,
): LineWords | null {
  const measured = measure(strokes);
  if (measured.length === 0) {
    return null;
  }
  const {line, band, end} = newestLine(measured);
  const parts = line.map(stroke => partOf(stroke.rect, band));
  const letters = line.filter((_, i) => parts[i] === 'letter');
  const marks = line.filter((_, i) => parts[i] === 'mark');
  const groups = clusters(letters.length > 0 ? letters : line);
  const gaps = groups
    .slice(1)
    .map((group, i) => boundsOfAll(group).left - boundsOfAll(groups[i]).right);
  const measures = lineMeasures(
    letters.map(stroke => height(stroke.rect)),
    gaps,
    spacing,
  );
  const words: Measured[][] = [[...groups[0]]];
  groups.slice(1).forEach((group, i) => {
    if (gaps[i] >= measures.wordGap) {
      words.push([...group]);
    } else {
      words[words.length - 1].push(...group);
    }
  });
  const newest = Math.max(...(letters.length ? letters : line).map(s => s.num));
  const chosen = words.findIndex(word => word.some(s => s.num === newest));
  const owned = words.map(word => word.map(stroke => stroke.num));
  for (const mark of marks) {
    const distances = words.map(word =>
      horizontalGap(mark.rect, boundsOfAll(word)),
    );
    const nearest = distances.indexOf(Math.min(...distances));
    if (distances[nearest] < measures.wordGap) {
      owned[nearest].push(mark.num);
    }
  }
  const kept = new Set(owned[chosen]);
  const verdicts: StrokeVerdict[] = [
    ...(end ? [{num: end.num, rect: end.rect, part: 'other line' as const, kept: false}] : []),
    ...line.map((stroke, i) => ({
      num: stroke.num,
      rect: stroke.rect,
      part: parts[i],
      kept: kept.has(stroke.num),
    })),
  ];
  return {words: owned.slice(0, chosen + 1), verdicts, measures};
}

/**
 * The rect grown by the margin, at least the smallest lasso on each side, and kept inside the
 * page, as lassoElements requires. `letterHeight` is the line's measured letter height.
 */
export function padToPage(
  rect: Rect,
  letterHeight: number,
  page: PageSize,
): Rect {
  const margin = letterHeight * LASSO_MARGIN_SHARE;
  const least = letterHeight * LASSO_MIN_SHARE;
  const grow = (low: number, high: number) =>
    Math.max(margin, (least - (high - low)) / 2);
  const x = grow(rect.left, rect.right);
  const y = grow(rect.top, rect.bottom);
  return {
    left: Math.max(0, Math.floor(rect.left - x)),
    top: Math.max(0, Math.floor(rect.top - y)),
    right: Math.min(page.width, Math.ceil(rect.right + x)),
    bottom: Math.min(page.height, Math.ceil(rect.bottom + y)),
  };
}

function choice(
  rule: WordRule,
  measured: Measured[],
  keptNums: number[],
  verdicts: StrokeVerdict[],
  measures: LineMeasures,
  page: PageSize,
): WordChoice | null {
  const kept = measured.filter(stroke => keptNums.includes(stroke.num));
  const rect = union(kept.map(stroke => stroke.rect));
  return rect === null
    ? null
    : {
        rule,
        rect: padToPage(rect, measures.height, page),
        strokes: kept.length,
        verdicts,
        measures,
      };
}

/**
 * The circle rule: the strokes before `circle` that it encloses; every stroke that meets the
 * circle's rect is weighed. Null when the circle is not a closed loop or holds nothing.
 */
export function wordInCircle(
  strokes: PageStroke[],
  circle: PageStroke,
  page: PageSize,
): WordChoice | null {
  const loop = boundsOf(circle.points);
  if (loop === null || !isClosedLoop(circle.points)) {
    return null;
  }
  const near = strokes.filter(stroke => {
    const rect = boundsOf(stroke.points);
    return (
      stroke.num !== circle.num &&
      rect !== null &&
      rect.left <= loop.right &&
      rect.right >= loop.left &&
      rect.top <= loop.bottom &&
      rect.bottom >= loop.top
    );
  });
  const inside = near.filter(stroke => isInside(stroke, circle.points));
  if (inside.length === 0) {
    return null;
  }
  const measured = measure(near);
  const keptNums = inside.map(stroke => stroke.num);
  const verdicts = measured.map(stroke => ({
    ...stroke,
    part: 'letter' as const,
    kept: keptNums.includes(stroke.num),
  }));
  const insideHeights = measured
    .filter(stroke => keptNums.includes(stroke.num))
    .map(stroke => height(stroke.rect));
  const measures = lineMeasures(insideHeights, [], 1);
  return choice('circle', measured, keptNums, verdicts, measures, page);
}

/** The last word of the page's strokes by position; null when there are none. */
export function selectWord(
  strokes: PageStroke[],
  page: PageSize,
  spacing: number,
): WordChoice | null {
  const word = lastWord(strokes, spacing);
  return word === null
    ? null
    : choice(
        'last word',
        measure(strokes),
        word.kept,
        word.verdicts,
        word.measures,
        page,
      );
}

/** The lasso for the line's last `count` words (#87); every word when `count` is larger. */
export function selectLastWords(
  strokes: PageStroke[],
  line: LineWords,
  count: number,
  page: PageSize,
): WordChoice | null {
  return choice(
    count > 1 ? 'last words' : 'last word',
    measure(strokes),
    line.words.slice(-count).flat(),
    line.verdicts,
    line.measures,
    page,
  );
}
