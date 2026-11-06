/**
 * The lassoed handwriting as a search query (brief section 8.2). The page size is the `size`
 * recognizeElements needs: the lasso size fails with 117 (device tests, builds 1 to 3).
 */
import {logged} from '../log/memory';
import {getLassoElements, getLassoRect, recognizeElements} from '../sdk/lasso';
import type {LassoPlace} from './place';
import {getCurrentFilePath, getCurrentPageNum, getPageSize} from '../sdk/page';
import {fail, ok, Result, THROWN_CODE} from '../sdk/result';

export type LassoQuery = {query: string; place: LassoPlace | null};

/**
 * The recognized word, trimmed, and where the lasso was (#20); an empty recognition is a
 * failure, never an empty query. A missing rect only loses the placement.
 */
export async function readLassoQuery(): Promise<Result<LassoQuery>> {
  const elements = await logged('getLassoElements', getLassoElements);
  if (!elements.ok) {
    return elements;
  }
  if (elements.value.length === 0) {
    return fail(THROWN_CODE, 'the lasso holds no handwriting');
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
  return ok({
    query,
    place: rect.ok
      ? {rect: rect.value, page: page.value, pageSize: size.value}
      : null,
  });
}
