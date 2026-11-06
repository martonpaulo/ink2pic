import {PLACE_GAP, placeRect} from '../src/flow/place';

const page = {width: 1920, height: 2560};
const picture = {width: 640, height: 593};

describe('placeRect (#20, #39)', () => {
  it('goes just below the word, left-aligned, never over it', () => {
    const word = {left: 100, top: 200, right: 300, bottom: 260};
    const rect = placeRect(word, picture, page);
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

  it('stays on the page when it fits neither below nor above', () => {
    const tall = {width: 640, height: 2000};
    const word = {left: 100, top: 1000, right: 300, bottom: 1100};
    expect(placeRect(word, tall, page)).toEqual({
      left: 100,
      top: 560,
      right: 740,
      bottom: 2560,
    });
  });
});
