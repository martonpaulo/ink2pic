import type {Rect} from '../src/sdk/lasso';
import {MIN_PLACE_BAND, PLACE_GAP, placeRect} from '../src/flow/place';

const page = {width: 1920, height: 2560};
const picture = {width: 640, height: 593};

function placed(...args: Parameters<typeof placeRect>): Rect {
  const rect = placeRect(...args);
  if (!rect) {
    throw new Error('no rect');
  }
  return rect;
}

describe('placeRect (#20, #39)', () => {
  it('goes just below the word, left-aligned, never over it', () => {
    const word = {left: 100, top: 200, right: 300, bottom: 260};
    const rect = placed(word, picture, page);
    expect(rect).toEqual({
      left: 100,
      top: 260 + PLACE_GAP,
      right: 740,
      bottom: 260 + PLACE_GAP + 593,
    });
    expect(rect.top).toBeGreaterThan(word.bottom);
  });

  it('goes just above the word when it does not fit below', () => {
    const word = {left: 1800, top: 2300, right: 1900, bottom: 2400};
    expect(placeRect(word, picture, page)).toEqual({
      left: 1280,
      top: 2300 - PLACE_GAP - 593,
      right: 1920,
      bottom: 2300 - PLACE_GAP,
    });
  });

  it('shrinks into the larger band, keeping proportions, rather than cover the word', () => {
    const tall = {width: 640, height: 2000};
    const word = {left: 100, top: 1000, right: 300, bottom: 1100};
    const rect = placed(word, tall, page);
    // Below: 2560 - 1124 = 1436 px of room, more than the 976 above.
    expect(rect.top).toBe(1100 + PLACE_GAP);
    expect(rect.bottom).toBe(2560);
    expect(rect.right - rect.left).toBe(Math.round((640 * 1436) / 2000));
  });

  it('shrinks a picture wider than the page without distorting it', () => {
    const wide = {width: 3840, height: 400};
    const rect = placed(
      {left: 0, top: 100, right: 50, bottom: 150},
      wide,
      page,
    );
    expect(rect.right - rect.left).toBe(1920);
    expect(rect.bottom - rect.top).toBe(200);
  });

  it('gives no rect when neither band is high enough to show the picture (#47)', () => {
    const word = {left: 100, top: 40, right: 300, bottom: 2500};
    expect(placeRect(word, picture, page)).toBeNull();
    const edge = {
      left: 100,
      top: 0,
      right: 300,
      bottom: 2560 - PLACE_GAP - MIN_PLACE_BAND,
    };
    expect(placed(edge, picture, page).bottom).toBe(2560);
  });
});
