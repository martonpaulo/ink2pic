/**
 * The lassoed handwriting as a search query (brief section 8.2). The page size is the `size`
 * recognizeElements needs: the lasso size fails with 117 (device tests, builds 1 to 3).
 */
import {logged} from '../log/memory';
import {getLassoElements, recognizeElements} from '../sdk/lasso';
import {getCurrentFilePath, getCurrentPageNum, getPageSize} from '../sdk/page';
import {fail, ok, Result, THROWN_CODE} from '../sdk/result';

/** The recognized word, trimmed; an empty recognition is a failure, never an empty query. */
export async function readLassoQuery(): Promise<Result<string>> {
  const elements = await logged('getLassoElements', getLassoElements);
  if (!elements.ok) {
    return elements;
  }
  if (elements.value.length === 0) {
    return fail(THROWN_CODE, 'the lasso holds no handwriting');
  }
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
  return query
    ? ok(query)
    : fail(THROWN_CODE, 'the handwriting was recognized as empty text');
}
