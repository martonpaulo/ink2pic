import {
  insideLoop,
  isClosedLoop,
  lastStrokes,
  padToPage,
  Point,
  selectWord,
  TimedStroke,
  WORD_MARGIN_PX,
  WORD_PAUSE_MS,
  wordInCircle,
} from '../src/flow/selectWord';

/** Synthetic handwriting in page pixels: a letter is a zigzag inside its box. */
function letter(left: number, top: number, at: number, size = 40): TimedStroke {
  const points: Point[] = [];
  for (let i = 0; i <= 10; i++) {
    points.push({x: left + (size * i) / 10, y: top + (i % 2 === 0 ? 0 : size)});
  }
  return {points, at};
}

/** A word of `count` letters from `left`, one letter every 300 ms. */
function word(left: number, top: number, count: number, start: number) {
  return Array.from({length: count}, (_, i) =>
    letter(left + i * 50, top, start + i * 300),
  );
}

function ellipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  at: number,
  turn = 1,
): TimedStroke {
  const points = Array.from({length: 40}, (_, i) => {
    const angle = (2 * Math.PI * turn * i) / 39;
    return {x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle)};
  });
  return {points, at};
}

const page = {width: 1920, height: 2560};

describe('the circle rule', () => {
  it('takes the strokes inside a circle drawn around them', () => {
    const before = word(100, 100, 3, 0);
    const soup = word(400, 100, 4, 5000);
    const circle = ellipse(475, 120, 140, 60, 9000);
    const inside = wordInCircle([...before, ...soup, circle]);
    expect(inside).toEqual(soup);
    const choice = selectWord([...before, ...soup, circle], page);
    expect(choice).toEqual({
      rule: 'circle',
      strokes: 4,
      rect: {
        left: 400 - WORD_MARGIN_PX,
        top: 100 - WORD_MARGIN_PX,
        right: 590 + WORD_MARGIN_PX,
        bottom: 140 + WORD_MARGIN_PX,
      },
    });
  });

  it('reads an open curve as handwriting, not as a circle', () => {
    const arc = ellipse(475, 120, 140, 60, 9000, 0.5);
    expect(isClosedLoop(arc.points)).toBe(false);
    expect(wordInCircle([...word(400, 100, 4, 5000), arc])).toBeNull();
  });

  it('falls back to the last strokes when the loop holds nothing, as a written «o»', () => {
    const o = ellipse(700, 120, 20, 20, 1200);
    const strokes = [...word(600, 100, 2, 0), o];
    expect(isClosedLoop(o.points)).toBe(true);
    expect(selectWord(strokes, page)?.rule).toBe('last strokes');
  });

  it('knows a point inside a loop from one outside it', () => {
    const loop = ellipse(0, 0, 10, 10, 0).points;
    expect(insideLoop({x: 0, y: 0}, loop)).toBe(true);
    expect(insideLoop({x: 20, y: 0}, loop)).toBe(false);
  });
});

describe('the last-strokes rule', () => {
  it('stops at a pause longer than a word allows', () => {
    const first = word(100, 100, 3, 0);
    const second = word(270, 100, 3, 600 + WORD_PAUSE_MS + 1);
    expect(lastStrokes([...first, ...second])).toEqual(second);
  });

  it('stops at another line', () => {
    const above = word(100, 100, 3, 0);
    const below = word(250, 300, 2, 900);
    expect(lastStrokes([...above, ...below])).toEqual(below);
  });

  it('stops at a wide gap on the same line, even written quickly', () => {
    const left = word(100, 100, 2, 0);
    const right = word(400, 100, 2, 700);
    expect(lastStrokes([...left, ...right])).toEqual(right);
  });

  it('keeps every letter of one word', () => {
    const soup = word(100, 100, 4, 0);
    expect(lastStrokes(soup)).toEqual(soup);
  });

  it('chooses nothing when nothing was written', () => {
    expect(selectWord([], page)).toBeNull();
  });
});

it('keeps the lasso inside the page, as lassoElements requires', () => {
  expect(padToPage({left: 2, top: 3, right: 1919, bottom: 2559}, page)).toEqual(
    {left: 0, top: 0, right: 1920, bottom: 2560},
  );
});
