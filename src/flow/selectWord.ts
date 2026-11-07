/**
 * Which strokes are «the word» the person means (#75): pure rules over strokes the pen-up events
 * delivered, in Android page pixels (docs.supernote.com, Coordinate System). Two candidate rules,
 * both measured by the #75 device spike before the main flow uses either:
 *
 * - circle: the last stroke is a closed loop drawn around earlier strokes; the word is the strokes
 *   inside it (the owner's flow, 2026-11-06);
 * - last strokes: walking back from the last stroke while each earlier one was written soon
 *   before, on the same line and close beside the group.
 *
 * The thresholds are first guesses [INFERENCE]; the probe logs the measures that tune them.
 */

export type Point = {x: number; y: number};
export type Rect = {left: number; top: number; right: number; bottom: number};
export type PageSize = {width: number; height: number};

/** One stroke: its sample points and when its pen-up arrived, in ms. */
export type TimedStroke = {points: Point[]; at: number};

export type WordRule = 'circle' | 'last strokes';
export type WordChoice = {rule: WordRule; rect: Rect; strokes: number};

/** A loop is closed when its ends are this near, as a share of its larger side. */
export const CLOSE_SHARE = 0.25;
/** Fewer sample points than this is a dot or a dash, never a circle. */
export const LOOP_MIN_POINTS = 12;
/** A stroke is inside the circle when at least this share of its points is. */
export const INSIDE_SHARE = 0.8;
/** The longest pause between two strokes of one word, in ms. */
export const WORD_PAUSE_MS = 1500;
/** Two strokes share a line when their vertical overlap is at least this share of the lower one. */
export const LINE_OVERLAP_SHARE = 0.3;
/** The widest gap beside the group, as a share of the group's height: wider starts another word. */
export const WORD_GAP_SHARE = 1;
/** Margin added around the word before it is lassoed, in page pixels. */
export const WORD_MARGIN_PX = 8;

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

function strokesBounds(strokes: TimedStroke[]): Rect | null {
  return union(
    strokes
      .map(stroke => boundsOf(stroke.points))
      .filter((rect): rect is Rect => rect !== null),
  );
}

/** A stroke whose two ends meet, relative to its size: a circle, an ellipse or a loop. */
export function isClosedLoop(points: Point[]): boolean {
  const rect = boundsOf(points);
  if (rect === null || points.length < LOOP_MIN_POINTS) {
    return false;
  }
  const side = Math.max(rect.right - rect.left, rect.bottom - rect.top);
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

/** The strokes that lie inside the loop, by the share of their points. */
export function strokesInside(
  strokes: TimedStroke[],
  loop: Point[],
): TimedStroke[] {
  return strokes.filter(stroke => {
    if (stroke.points.length === 0) {
      return false;
    }
    const inside = stroke.points.filter(point => insideLoop(point, loop));
    return inside.length >= stroke.points.length * INSIDE_SHARE;
  });
}

/** The circle rule: the strokes before the last one that it encloses; null when none. */
export function wordInCircle(strokes: TimedStroke[]): TimedStroke[] | null {
  const circle = strokes[strokes.length - 1];
  if (!circle || !isClosedLoop(circle.points)) {
    return null;
  }
  const inside = strokesInside(strokes.slice(0, -1), circle.points);
  return inside.length > 0 ? inside : null;
}

function sameLine(a: Rect, b: Rect): boolean {
  const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  const lower = Math.min(a.bottom - a.top, b.bottom - b.top);
  return overlap >= Math.max(lower, 1) * LINE_OVERLAP_SHARE;
}

function horizontalGap(a: Rect, b: Rect): number {
  return Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
}

/** The last-strokes rule: the newest strokes written in one go, on one line, side by side. */
export function lastStrokes(strokes: TimedStroke[]): TimedStroke[] {
  const word: TimedStroke[] = [];
  let group: Rect | null = null;
  for (let i = strokes.length - 1; i >= 0; i--) {
    const stroke = strokes[i];
    const rect = boundsOf(stroke.points);
    if (rect === null) {
      continue;
    }
    if (group !== null) {
      const newer = word[0];
      const pause = newer.at - stroke.at;
      const height = Math.max(group.bottom - group.top, 1);
      if (
        pause > WORD_PAUSE_MS ||
        !sameLine(group, rect) ||
        horizontalGap(group, rect) > height * WORD_GAP_SHARE
      ) {
        break;
      }
    }
    word.unshift(stroke);
    group = group === null ? rect : union([group, rect]);
  }
  return word;
}

/** The rect grown by the margin and kept inside the page, as lassoElements requires. */
export function padToPage(rect: Rect, page: PageSize): Rect {
  return {
    left: Math.max(0, Math.floor(rect.left - WORD_MARGIN_PX)),
    top: Math.max(0, Math.floor(rect.top - WORD_MARGIN_PX)),
    right: Math.min(page.width, Math.ceil(rect.right + WORD_MARGIN_PX)),
    bottom: Math.min(page.height, Math.ceil(rect.bottom + WORD_MARGIN_PX)),
  };
}

/**
 * The word for the strokes written so far, oldest first: the circle rule when the last stroke
 * encloses earlier ones, else the last-strokes rule; null when there are no strokes.
 */
export function selectWord(
  strokes: TimedStroke[],
  page: PageSize,
): WordChoice | null {
  const circled = wordInCircle(strokes);
  const rule: WordRule = circled ? 'circle' : 'last strokes';
  const word = circled ?? lastStrokes(strokes);
  const rect = strokesBounds(word);
  return rect === null
    ? null
    : {rule, rect: padToPage(rect, page), strokes: word.length};
}
