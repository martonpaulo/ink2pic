/**
 * The pen and the page's strokes, for the #75 spike: pen-up and motion events, the last element,
 * the page's elements, and the pen in use. Read from sn-plugin-lib 0.2.3
 * and docs.supernote.com (PluginManager.registerEventListener and registerMotionListener,
 * PluginFileAPI.getLastElement and getElements, PluginCommAPI.getPenInfo).
 */
import {PluginCommAPI, PluginFileAPI, PluginManager} from 'sn-plugin-lib';
import {attempt, fail, fromResponse, ok, Result, THROWN_CODE} from './result';

/** The only plugin event the docs list: its message is the Element[] just written. */
const PEN_UP_EVENT = 'event_pen_up';
/** registerType 1: normal order among the plugins that listen (0 first, 2 last). */
const NORMAL_ORDER = 1;
/** Sample points read per bridge call: a word's stroke has a few hundred. */
const POINTS_PER_READ = 500;
/** More points than this are cut, so one long scribble cannot hold the bridge. */
export const MAX_STROKE_POINTS = 4000;

export type PenPoint = {x: number; y: number};
/** The fields of a MotionEvent the spike reads; x and y are screen pixels (docs, MotionEvent). */
export type Motion = {
  action: number;
  x: number;
  y: number;
  toolType: number;
  eventTime: number;
  downTime: number;
};
/** Pen type 10 fineliner, 16 pressure pen, 11 marker, 15 calligraphy (docs, PenInfo). */
export type PenInfo = {type: number; color: number; width: number};

/** An element as the SDK hands it over: plain fields plus native point accessors. */
type Accessor<T> = {
  size(): Promise<number>;
  getRange(start: number, count: number): Promise<T[]>;
};
type SdkElement = {
  uuid?: string;
  type?: number;
  stroke?: {points?: Accessor<PenPoint>} | null;
  recycle?: () => Promise<void>;
};

function thrown(error: unknown): Result<never> {
  return fail(
    THROWN_CODE,
    error instanceof Error ? error.message : String(error),
  );
}

function subscribe(register: () => {remove: () => void}): Result<() => void> {
  try {
    const subscription = register();
    return ok(() => subscription.remove());
  } catch (error) {
    return thrown(error);
  }
}

/** Calls `listener` with the elements of each stroke the person ends; returns the stop function. */
export function onPenUp(
  listener: (elements: object[]) => void,
): Result<() => void> {
  return subscribe(() =>
    PluginManager.registerEventListener(PEN_UP_EVENT, NORMAL_ORDER, {
      onMsg: (msg: unknown) => listener(Array.isArray(msg) ? msg : []),
    }),
  );
}

/** Calls `listener` with each touch or pen motion; returns the stop function. */
export function onMotion(
  listener: (motion: Motion) => void,
): Result<() => void> {
  return subscribe(() =>
    PluginManager.registerMotionListener(NORMAL_ORDER, {
      onMsg: (msg: Motion) => listener(msg),
    }),
  );
}

/** The last element of the current note page; null when the page is empty. */
export function getLastElement(): Promise<Result<object | null>> {
  return attempt(() => PluginFileAPI.getLastElement());
}

/** Every element of a page: strokes, pictures, titles, links, text boxes. */
export function getElements(
  page: number,
  notePath: string,
): Promise<Result<object[]>> {
  return attempt(() => PluginFileAPI.getElements(page, notePath));
}

/**
 * The docs answer an APIResponse; the 0.2.3 source passes the native answer through untyped, so a
 * bare PenInfo counts too, and the log shows which one the host sends.
 */
export function getPenInfo(): Promise<Result<PenInfo>> {
  return attempt(
    () => PluginCommAPI.getPenInfo(),
    raw =>
      raw !== null && typeof raw === 'object' && !('success' in raw)
        ? ok(raw as PenInfo)
        : fromResponse<PenInfo>(raw),
  );
}

/** A stroke's sample points in page pixels, at most MAX_STROKE_POINTS; empty for other types. */
export async function strokePoints(
  element: object,
): Promise<Result<PenPoint[]>> {
  const accessor = (element as SdkElement).stroke?.points;
  if (!accessor) {
    return ok([]);
  }
  try {
    const size = Math.min(await accessor.size(), MAX_STROKE_POINTS);
    const points: PenPoint[] = [];
    for (let start = 0; start < size; start += POINTS_PER_READ) {
      const count = Math.min(POINTS_PER_READ, size - start);
      points.push(...(await accessor.getRange(start, count)));
    }
    return ok(points);
  } catch (error) {
    return thrown(error);
  }
}

/** Frees the element's native point cache (docs, Element Caching and Release). */
export async function recycleElement(element: object): Promise<Result<true>> {
  try {
    await (element as SdkElement).recycle?.();
    return ok(true);
  } catch (error) {
    return thrown(error);
  }
}
