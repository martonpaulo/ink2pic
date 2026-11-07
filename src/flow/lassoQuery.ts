/**
 * The lassoed handwriting as a search query (brief section 8.2). The page size is the `size`
 * recognizeElements needs: the lasso size fails with 117 (device tests, builds 1 to 3).
 */
import {log, logged} from '../log/memory';
import {
  getLassoElements,
  getLassoRect,
  Rect,
  recognizeElements,
} from '../sdk/lasso';
import type {LassoPlace} from './place';
import {getCurrentFilePath, getCurrentPageNum, getPageSize} from '../sdk/page';
import {
  EMPTY_LASSO_CODE,
  fail,
  ok,
  Result,
  THROWN_CODE,
} from '../sdk/result';

export type LassoQuery = {query: string; place: LassoPlace | null};

/**
 * What Lasso last word chose (#87): the words it lassoed and what they search. Insert picture on
 * that same lasso searches it with no second recognition; any other lasso is recognised as before.
 */
export type WordPick = {query: string; rect: Rect; strokes: number};

let pick: WordPick | null = null;

/** Lasso last word left this lasso on the page; the next lasso query takes it once. */
export function rememberPick(chosen: WordPick | null): void {
  pick = chosen;
}

function within(inner: Rect, outer: Rect): boolean {
  return (
    inner.left >= outer.left &&
    inner.top >= outer.top &&
    inner.right <= outer.right &&
    inner.bottom <= outer.bottom
  );
}

/** The remembered pick when the lasso is the one it made: as many strokes, inside its rect. */
function takePick(lassoed: number, rect: Result<Rect>): WordPick | null {
  const chosen = pick;
  pick = null;
  return chosen && rect.ok && lassoed === chosen.strokes && within(rect.value, chosen.rect)
    ? chosen
    : null;
}

/**
 * The recognized word, trimmed, and where the lasso was (#20); an empty recognition is a
 * failure, never an empty query. A missing rect only loses the placement.
 */
export async function readLassoQuery(
  /** The elements the opening already read (#44): not read again. */
  known?: object[],
): Promise<Result<LassoQuery>> {
  const elements = known
    ? ok(known)
    : await logged('getLassoElements', getLassoElements);
  if (!elements.ok) {
    return elements;
  }
  if (elements.value.length === 0) {
    return fail(EMPTY_LASSO_CODE, 'the lasso holds no handwriting');
  }
  // The rect too, before the slow recognition: lasso context is short-lived (#33).
  const rect = await logged('getLassoRect', getLassoRect);
  const path = await logged('getCurrentFilePath', getCurrentFilePath);
  if (!path.ok) {
    return path;
  }
  const page = await logged('getCurrentPageNum', getCurrentPageNum);
  if (!page.ok) {
    return page;
  }
  const size = await logged('getPageSize', () =>
    getPageSize(path.value, page.value),
  );
  if (!size.ok) {
    return size;
  }
  const place = rect.ok
    ? {rect: rect.value, page: page.value, pageSize: size.value}
    : null;
  const picked = takePick(elements.value.length, rect);
  if (picked) {
    log(`lasso query: "${picked.query}", as Lasso last word chose it`);
    return ok({query: picked.query, place});
  }
  const text = await logged('recognizeElements', () =>
    recognizeElements(elements.value, size.value),
  );
  if (!text.ok) {
    return text;
  }
  const query = text.value.trim();
  if (!query) {
    return fail(THROWN_CODE, 'the handwriting was recognized as empty text');
  }
  return ok({query, place});
}
