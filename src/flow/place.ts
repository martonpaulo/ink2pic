/**
 * Placement at the lassoed word (brief section 8.3, #20; spike S5): a Picture element just below
 * the word, never over it (#39), inserted with insertPageElements. When anything fails, the caller
 * falls back to insertImage and the host's placement. The handwritten word is kept [DEFAULT].
 */
import {logged} from '../log/memory';
import type {Rect} from '../sdk/lasso';
import {
  createElement,
  insertPageElements,
  PICTURE_TYPE,
  Size,
} from '../sdk/page';
import {fail, ok, Result, THROWN_CODE} from '../sdk/result';

/** Where the lasso was when the view opened; lasso context does not survive navigation. */
export type LassoPlace = {rect: Rect; page: number; pageSize: Size};

/** Space between the word and the picture, in page pixels. */
export const PLACE_GAP = 24;
/**
 * The smallest band a picture is placed in: the host's own insertImage minimum per side (brief
 * section 10.5). A lower band would shrink the picture out of sight (#47).
 */
export const MIN_PLACE_BAND = 100;

/**
 * The picture's rect, left-aligned with the word: just below it, else just above it, so it never
 * covers the handwriting (#39). When it fits neither, it shrinks, keeping its proportions, into
 * the larger free band; it also shrinks to the page width. Null when that band is lower than
 * MIN_PLACE_BAND, so the caller falls back to insertImage (#47).
 */
export function placeRect(
  lasso: Rect,
  picture: {width: number; height: number},
  page: Size,
): Rect | null {
  const below = lasso.bottom + PLACE_GAP;
  const aboveRoom = Math.max(0, lasso.top - PLACE_GAP);
  const belowRoom = Math.max(0, page.height - below);
  const fitWidth = Math.min(1, page.width / picture.width);
  let height = picture.height * fitWidth;
  const goesBelow = height <= belowRoom || belowRoom >= aboveRoom;
  const room = goesBelow ? belowRoom : aboveRoom;
  if (room < MIN_PLACE_BAND) {
    return null;
  }
  const scale = fitWidth * Math.min(1, room / height);
  const width = Math.round(picture.width * scale);
  height = Math.round(picture.height * scale);
  const left = Math.max(0, Math.min(lasso.left, page.width - width));
  const top = goesBelow ? below : aboveRoom - height;
  return {left, top, right: left + width, bottom: top + height};
}

export async function placeAtLasso(
  path: string,
  picture: {width: number; height: number},
  place: LassoPlace,
): Promise<Result<true>> {
  const rect = placeRect(place.rect, picture, place.pageSize);
  if (!rect) {
    return fail(THROWN_CODE, `no band of ${MIN_PLACE_BAND} px beside the lasso`);
  }
  const created = await logged('createElement(picture)', () =>
    createElement(PICTURE_TYPE),
  );
  if (!created.ok) {
    return created;
  }
  const element = {
    ...created.value,
    type: PICTURE_TYPE,
    pageNum: place.page,
    layerNum: 0,
    picture: {picturePath: path, rect},
  };
  const inserted = await logged(
    `insertPageElements(picture at ${JSON.stringify(rect)})`,
    () => insertPageElements([element], place.page, 0),
  );
  if (!inserted.ok) {
    return inserted;
  }
  return inserted.value
    ? ok(true)
    : fail(THROWN_CODE, 'insertPageElements answered false');
}
