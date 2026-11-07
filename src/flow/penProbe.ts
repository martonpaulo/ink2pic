/**
 * The #75 device spike: logs what the pen, the page and a plugin-made lasso really give, so the
 * one-button flow is designed from the device and not from the type definitions. Log only; it
 * never changes or deletes a stroke. Every line starts with «probe» so the report finds them.
 *
 * Once armed (by Probe in the Log view), each pen-up logs the last element and the pen; a circle
 * drawn around earlier strokes is lassoed natively with the view closed. Probe also lassoes the
 * page's last picture and reads the lasso back; Lasso last word lassoes the last strokes. Both
 * close the view after the lasso, so the person sees whether the native lasso stays.
 */
import {brief, log, logged} from '../log/memory';
import {
  getLassoElements,
  getLassoRect,
  lassoElements,
  Rect,
} from '../sdk/lasso';
import {getCurrentFilePath, getCurrentPageNum, getPageSize} from '../sdk/page';
import {
  getElements,
  getLastElement,
  getPenInfo,
  Motion,
  onMotion,
  onPenUp,
  PenPoint,
  recycleElement,
  strokePoints,
} from '../sdk/pen';
import {closePluginView} from '../sdk/plugin';
import {
  boundsOf,
  PageSize,
  selectWord,
  TimedStroke,
  WordChoice,
} from './selectWord';

/** `Element.TYPE_STROKE` and `TYPE_PICTURE` (docs, Element). */
const STROKE_TYPE = 0;
const PICTURE_TYPE = 200;
/** Android MotionEvent actions (docs, MotionEvent). */
const ACTION_DOWN = 0;
const ACTION_UP = 1;
const ACTION_MOVE = 2;
const ACTION_CANCEL = 3;
/** Strokes kept for the word rules: a few words' worth. */
export const PROBE_STROKES = 40;
/** Points a log line shows of a circle, spread over the whole loop. */
const SAMPLE_POINTS = 8;
/** Long enough for a picture's path and rect on one line. */
const FIELDS_MAX = 400;

type PageContext = {path: string; page: number; size: PageSize};
type SdkElement = {
  uuid?: string;
  type?: number;
  numInPage?: number;
  picture?: {picturePath?: string; rect?: Rect} | null;
};

let stops: (() => void)[] = [];
let strokes: TimedStroke[] = [];
let context: PageContext | null = null;
let motion: {points: PenPoint[]; toolType: number} | null = null;
/** Pen-ups are handled one after another, in the order they arrive. */
let queue: Promise<void> = Promise.resolve();

export function probeArmed(): boolean {
  return stops.length > 0;
}

/** Stops listening and forgets the strokes (tests; the plugin keeps the probe for its life). */
export function stopPenProbe(): void {
  stops.forEach(stop => stop());
  stops = [];
  strokes = [];
  context = null;
  motion = null;
  queue = Promise.resolve();
}

/** Resolves when every pen-up received so far is handled (tests). */
export function probeIdle(): Promise<void> {
  return queue;
}

async function readContext(): Promise<PageContext | null> {
  const path = await logged('getCurrentFilePath', getCurrentFilePath);
  const page = await logged('getCurrentPageNum', getCurrentPageNum);
  if (!path.ok || !page.ok) {
    return null;
  }
  const size = await logged('getPageSize', () =>
    getPageSize(path.value, page.value),
  );
  if (!size.ok) {
    return null;
  }
  if (context && (context.path !== path.value || context.page !== page.value)) {
    log('probe: another page, the strokes so far are dropped');
    strokes = [];
  }
  context = {path: path.value, page: page.value, size: size.value};
  return context;
}

function sample(points: PenPoint[]): PenPoint[] {
  if (points.length <= SAMPLE_POINTS) {
    return points;
  }
  const step = (points.length - 1) / (SAMPLE_POINTS - 1);
  return Array.from({length: SAMPLE_POINTS}, (_, i) => {
    const point = points[Math.round(i * step)];
    return {x: Math.round(point.x), y: Math.round(point.y)};
  });
}

function describe(element: object): string {
  const e = element as SdkElement;
  const picture =
    e.type === PICTURE_TYPE ? ` picture ${brief(e.picture, FIELDS_MAX)}` : '';
  return `type ${e.type} #${e.numInPage} uuid ${e.uuid}${picture}`;
}

function typeCounts(elements: object[]): string {
  const counts: Record<string, number> = {};
  for (const element of elements) {
    const type = String((element as SdkElement).type);
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return brief(counts);
}

/**
 * Lassoes the rect natively and reads it back, with the pen before and after: answers whether
 * lassoElements selects what the rect holds, what a lassoed picture carries, and whether the
 * lasso changes the pen.
 */
async function lassoAndRead(rect: Rect, expected: string): Promise<void> {
  await logged('getPenInfo (before the lasso)', getPenInfo);
  log(`probe lasso: rect ${brief(rect)}, expected ${expected}`);
  const lassoed = await logged('lassoElements', () => lassoElements(rect));
  if (!lassoed.ok) {
    return;
  }
  await logged('getLassoRect', getLassoRect);
  const held = await logged('getLassoElements', getLassoElements);
  if (held.ok) {
    log(
      `probe lasso holds ${held.value.length}: types ${typeCounts(held.value)}`,
    );
    held.value
      .filter(element => (element as SdkElement).type === PICTURE_TYPE)
      .forEach(element =>
        log(
          `probe lasso picture: keys ${brief(
            Object.keys(element),
            FIELDS_MAX,
          )}; ${describe(element)}`,
        ),
      );
  }
  await logged('getPenInfo (after the lasso)', getPenInfo);
}

async function handlePenUp(elements: object[], at: number): Promise<void> {
  const previous = strokes[strokes.length - 1];
  const pause = previous ? `${at - previous.at} ms after the last` : 'first';
  log(
    `probe pen-up: ${elements.length} element(s), ${pause}; ${elements
      .map(describe)
      .join('; ')}`,
  );
  const page = context ?? (await readContext());
  const last = await logged('getLastElement', getLastElement);
  if (!last.ok || last.value === null) {
    return;
  }
  const value = last.value;
  const element = value as SdkElement;
  const points = await logged('strokePoints', () => strokePoints(value));
  await logged('recycleElement', () => recycleElement(value));
  const rect = points.ok ? boundsOf(points.value) : null;
  log(
    `probe last element: ${describe(element)}, rect ${brief(rect)}, ${
      points.ok ? points.value.length : 0
    } points, at ${at}`,
  );
  await logged('getPenInfo', getPenInfo);
  if (element.type !== STROKE_TYPE || !points.ok || page === null) {
    return;
  }
  strokes = [...strokes, {points: points.value, at}].slice(-PROBE_STROKES);
  const word = selectWord(strokes, page.size);
  logWord(word);
  if (word?.rule === 'circle') {
    log(
      `probe circle: ${points.value.length} points, rect ${brief(
        rect,
      )}, sample ${brief(sample(points.value), FIELDS_MAX)}`,
    );
    await lassoAndRead(
      word.rect,
      `${word.strokes} stroke(s) inside the circle`,
    );
  }
}

function logWord(word: WordChoice | null): void {
  log(
    word
      ? `probe word: rule ${word.rule}, ${word.strokes} stroke(s), rect ${brief(
          word.rect,
        )}`
      : 'probe word: none',
  );
}

/** One line per pen or finger contact, at its end: the motion moves are not logged one by one. */
function handleMotion(event: Motion): void {
  if (event.action === ACTION_DOWN) {
    motion = {points: [{x: event.x, y: event.y}], toolType: event.toolType};
    return;
  }
  if (motion === null) {
    return;
  }
  motion.points.push({x: event.x, y: event.y});
  if (event.action === ACTION_MOVE) {
    return;
  }
  if (event.action === ACTION_UP || event.action === ACTION_CANCEL) {
    log(
      `probe motion ${event.action === ACTION_UP ? 'up' : 'cancel'}: tool ${
        motion.toolType
      }, ${motion.points.length} points, screen rect ${brief(
        boundsOf(motion.points),
      )}, ${event.eventTime - event.downTime} ms, sample ${brief(
        sample(motion.points),
        FIELDS_MAX,
      )}`,
    );
    motion = null;
  }
}

/** Starts the pen-up and motion listeners once; a failed registration is logged. */
async function arm(): Promise<void> {
  if (probeArmed()) {
    log('probe: already listening');
    return;
  }
  await logged('getPenInfo (armed)', getPenInfo);
  const penUp = onPenUp(elements => {
    const at = Date.now();
    queue = queue.then(() =>
      handlePenUp(elements, at).catch(error =>
        log(`probe pen-up failed: ${String(error)}`),
      ),
    );
  });
  log(
    penUp.ok
      ? 'probe: pen-up listener on'
      : `probe: pen-up listener failed: ${penUp.code} ${penUp.message}`,
  );
  const moves = onMotion(handleMotion);
  log(
    moves.ok
      ? 'probe: motion listener on'
      : `probe: motion listener failed: ${moves.code} ${moves.message}`,
  );
  stops = [penUp, moves].flatMap(result => (result.ok ? [result.value] : []));
}

/**
 * Probe: arms the listeners, logs the page's elements and every picture's fields, lassoes the
 * last picture and reads the lasso back, then closes the view.
 */
export async function runProbe(): Promise<void> {
  await arm();
  const page = await readContext();
  if (page === null) {
    return;
  }
  const all = await logged('getElements', () =>
    getElements(page.page, page.path),
  );
  if (all.ok) {
    log(
      `probe page: ${all.value.length} element(s), types ${typeCounts(
        all.value,
      )}`,
    );
    const pictures = all.value.filter(
      element => (element as SdkElement).type === PICTURE_TYPE,
    );
    pictures.forEach(element =>
      log(`probe page picture: ${describe(element)}`),
    );
    const lastPicture = pictures[pictures.length - 1] as SdkElement | undefined;
    if (lastPicture?.picture?.rect) {
      await lassoAndRead(
        lastPicture.picture.rect,
        `picture #${lastPicture.numInPage}`,
      );
    } else {
      log('probe page: no picture to lasso');
    }
    for (const element of all.value) {
      await recycleElement(element);
    }
  }
  await logged('closePluginView', closePluginView);
}

/** Lasso last word: lassoes the word the rules choose from the strokes so far, then closes. */
export async function lassoLastWord(): Promise<void> {
  await queue;
  const page = await readContext();
  const word = page ? selectWord(strokes, page.size) : null;
  logWord(word);
  if (word === null) {
    log('probe: no strokes yet; tap Probe, write a word, then try again');
    return;
  }
  await lassoAndRead(
    word.rect,
    `${word.strokes} stroke(s) by the ${word.rule} rule`,
  );
  await logged('closePluginView', closePluginView);
}
