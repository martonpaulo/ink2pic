/**
 * Placement at the lassoed word (brief section 8.3, #20; spike S5): a Picture element just below
 * the word, never over it (#39), inserted with insertPageElements; beside it, or in place of it,
 * when the person chose so in Settings (#70). When anything fails, the caller falls back to
 * insertImage and the host's placement. The handwritten word is kept unless the person chose
 * «In place of the word».
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

/** Where the picture goes, the person's setting (#70); below the word is today's default. */
export type Placement = 'below' | 'replace' | 'beside';

/**
 * The picture's rect, left-aligned with the word: just below it, else just above it, so it never
 * covers the handwriting (#39). When it fits neither, it shrinks, keeping its proportions, into
 * the larger free band; it also shrinks to the page width. Null when that band is lower than
 * MIN_PLACE_BAND, so the caller falls back to insertImage (#47).
 */
function belowRect(
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

/** The picture scaled down, keeping its proportions, to fit `width` x `height`; never up. */
function fitInto(
  picture: {width: number; height: number},
  width: number,
  height: number,
): {width: number; height: number} {
  const scale = Math.min(1, width / picture.width, height / picture.height);
  return {
    width: Math.round(picture.width * scale),
    height: Math.round(picture.height * scale),
  };
}

/**
 * In place of the word (#70): from the word's top-left corner, the handwriting the caller then
 * deletes; shrunk to the page. Null when less than MIN_PLACE_BAND is left below the word's top.
 */
function inPlaceRect(
  lasso: Rect,
  picture: {width: number; height: number},
  page: Size,
): Rect | null {
  const room = page.height - lasso.top;
  if (room < MIN_PLACE_BAND) {
    return null;
  }
  const size = fitInto(picture, page.width, room);
  const left = Math.max(0, Math.min(lasso.left, page.width - size.width));
  return {
    left,
    top: lasso.top,
    right: left + size.width,
    bottom: lasso.top + size.height,
  };
}

/**
 * Beside the word (#70): to its right, top-aligned, else to its left when that side has more
 * room; shrunk into that band. Null when neither side has MIN_PLACE_BAND, so the caller places it
 * below.
 */
function besideRect(
  lasso: Rect,
  picture: {width: number; height: number},
  page: Size,
): Rect | null {
  const rightRoom = Math.max(0, page.width - lasso.right - PLACE_GAP);
  const leftRoom = Math.max(0, lasso.left - PLACE_GAP);
  const goesRight = picture.width <= rightRoom || rightRoom >= leftRoom;
  const size = fitInto(
    picture,
    goesRight ? rightRoom : leftRoom,
    Math.max(0, page.height - lasso.top),
  );
  if (size.width < MIN_PLACE_BAND || size.height < MIN_PLACE_BAND) {
    return null;
  }
  const left = goesRight
    ? lasso.right + PLACE_GAP
    : lasso.left - PLACE_GAP - size.width;
  const top = Math.max(0, Math.min(lasso.top, page.height - size.height));
  return {left, top, right: left + size.width, bottom: top + size.height};
}

/** The picture's rect for the person's placement; null when it fits nowhere near the word. */
export function placeRect(
  lasso: Rect,
  picture: {width: number; height: number},
  page: Size,
  placement: Placement = 'below',
): Rect | null {
  switch (placement) {
    case 'replace':
      return inPlaceRect(lasso, picture, page);
    case 'beside':
      return (
        besideRect(lasso, picture, page) ?? belowRect(lasso, picture, page)
      );
    case 'below':
      return belowRect(lasso, picture, page);
  }
}

/** Inserts the picture beside the lasso; its value is the rect the picture was placed at (#73). */
export async function placeAtLasso(
  path: string,
  picture: {width: number; height: number},
  place: LassoPlace,
  placement: Placement = 'below',
): Promise<Result<Rect>> {
  const rect = placeRect(place.rect, picture, place.pageSize, placement);
  if (!rect) {
    return fail(
      THROWN_CODE,
      `no band of ${MIN_PLACE_BAND} px beside the lasso`,
    );
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
    ? ok(rect)
    : fail(THROWN_CODE, 'insertPageElements answered false');
}
