import {placeRect} from '../src/flow/place';

const page = {width: 1920, height: 2560};

describe('placeRect (#20)', () => {
  it('starts at the lasso corner with the picture size', () => {
    expect(
      placeRect(
        {left: 100, top: 200, right: 300, bottom: 260},
        {width: 640, height: 593},
        page,
      ),
    ).toEqual({
      left: 100,
      top: 200,
      right: 740,
      bottom: 793,
    });
  });

  it('keeps the picture on the page', () => {
    expect(
      placeRect(
        {left: 1800, top: 2500, right: 1900, bottom: 2550},
        {width: 640, height: 593},
        page,
      ),
    ).toEqual({
      left: 1280,
      top: 1967,
      right: 1920,
      bottom: 2560,
    });
  });
});
