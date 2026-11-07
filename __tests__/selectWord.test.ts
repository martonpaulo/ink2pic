import {readFileSync} from 'fs';
import {join} from 'path';
import {
  insideLoop,
  isClosedLoop,
  LASSO_MIN_SHARE,
  LASSO_MIN_SIDE,
  lineMeasures,
  lineWords,
  padToPage,
  PageStroke,
  Point,
  Rect,
  selectLastWords,
  selectWord,
  wordInCircle,
} from '../src/flow/selectWord';
import {SPACING_SCALES} from '../src/settings/settings';

const page = {width: 1920, height: 2560};

/** The device log's strokes, scrubbed: numInPage, rect and point count only. */
const china: {strokes: {num: number; rect: Rect; points: number}[]} = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'handwriting-china.json'), 'utf8'),
);
const NORMAL = SPACING_SCALES.normal;

/** A stroke filling its rect with a zigzag, the shape the rules read from a stroke's points. */
function stroke(num: number, rect: Rect, count = 11): PageStroke {
  const points: Point[] = [];
  const steps = Math.max(count - 1, 1);
  for (let i = 0; i <= steps; i++) {
    points.push({
      x: rect.left + ((rect.right - rect.left) * i) / steps,
      y: i % 2 === 0 ? rect.top : rect.bottom,
    });
  }
  return {num, points};
}

/**
 * Synthetic handwriting in the owner's measured proportions (build 15 logs, #75): x-height 36 px,
 * ascenders and descenders 40 px more, letter gaps 6–20 px, word gaps 48–60 px. Each letter is
 * one stroke, written in order; an i-dot or j-dot right after its letter, a t-bar right after the
 * «t», an accent right after its letter. `gaps` overrides the letter and word gaps, in order.
 */
const TALL = new Set('bdfhklCMQ'.split(''));
const LOW = new Set('gjpqy'.split(''));
const LETTER_GAPS = [8, 14, 10, 18, 6, 12, 20, 9];
const WORD_GAPS = [52, 58, 48, 60];

function handwrite(
  text: string,
  top: number,
  first = 1,
  gaps: {letter?: number[]; word?: number[]} = {},
): PageStroke[] {
  const letterGaps = gaps.letter ?? LETTER_GAPS;
  const wordGaps = gaps.word ?? WORD_GAPS;
  const bottom = top + 36;
  const strokes: PageStroke[] = [];
  let x = 100;
  let num = first;
  let letters = 0;
  let words = 0;
  const add = (rect: Rect, count?: number) =>
    strokes.push(stroke(num++, rect, count));
  text.split(' ').forEach((word, w) => {
    if (w > 0) {
      x += wordGaps[words++ % wordGaps.length];
    }
    [...word].forEach((char, c) => {
      if (c > 0) {
        x += letterGaps[letters++ % letterGaps.length];
      }
      const base = char.normalize('NFD')[0];
      const width = 'il'.includes(base) ? 6 : 'mwCM'.includes(base) ? 55 : 34;
      const rect = {
        left: x,
        right: x + width,
        top: TALL.has(base) ? top - 40 : base === 't' ? top - 25 : top,
        bottom: LOW.has(base) ? bottom + 40 : bottom,
      };
      add(rect, 40);
      const middle = Math.round((rect.left + rect.right) / 2);
      if (base === 'i' || base === 'j') {
        add({left: middle - 1, top: top - 14, right: middle + 1, bottom: top - 11}, 3);
      }
      if (base === 't') {
        add({left: rect.left - 12, top: top + 2, right: rect.right + 12, bottom: top + 7}, 12);
      }
      if (char !== base) {
        add({left: middle - 4, top: top - 20, right: middle + 6, bottom: top - 6}, 8);
      }
      x = rect.right;
    });
  });
  return strokes;
}

/** The numbers of the strokes the choice kept. */
function kept(strokes: PageStroke[], spacing = NORMAL): number[] {
  const choice = selectWord(strokes, page, spacing);
  return (choice?.verdicts ?? []).filter(v => v.kept).map(v => v.num);
}

/** The strokes `handwrite` made for the last word of `text`, by their numbers. */
function lastWordNums(lines: PageStroke[][], text: string): number[] {
  const words = text.split(' ');
  const last = lines[lines.length - 1];
  const before = handwrite(words.slice(0, -1).join(' '), 0).length;
  const offset = words.length > 1 ? before : 0;
  return last.slice(offset).map(s => s.num);
}

function phrase(...lines: string[]): {strokes: PageStroke[]; lines: PageStroke[][]} {
  const made: PageStroke[][] = [];
  let first = 1;
  lines.forEach((line, i) => {
    const strokes = handwrite(line, 200 + i * 150, first);
    made.push(strokes);
    first += strokes.length;
  });
  return {strokes: made.flat(), lines: made};
}

describe('the last word, by position (#75)', () => {
  it('takes all of «China» from the device log, i-dot, «C» and «h» included', () => {
    const strokes = china.strokes.map(s => stroke(s.num, s.rect, s.points));
    const choice = selectWord(strokes, page, NORMAL);
    expect(kept(strokes)).toEqual([150, 151, 152, 153, 154, 155]);
    // The rect holds the «C» and the «h», which rise above the short letters.
    expect(choice?.rect.left).toBeLessThan(796);
    expect(choice?.rect.top).toBeLessThan(778);
    // «até» and «a» stay out; the first line ends the walk.
    const verdicts = choice?.verdicts ?? [];
    expect(verdicts.find(v => v.num === 149)).toMatchObject({kept: false, part: 'letter'});
    expect(verdicts.find(v => v.num === 148)).toMatchObject({kept: false, part: 'mark'});
    expect(verdicts.find(v => v.num === 153)).toMatchObject({kept: true, part: 'mark'});
    expect(verdicts[0]).toMatchObject({num: 143, part: 'other line', kept: false});
  });

  it('takes all of «frio» inside a phrase, past its i-dot and the tall «f»', () => {
    const {strokes, lines} = phrase('ontem eu descobri o que de fato', 'é o frio');
    expect(kept(strokes)).toEqual(lastWordNums(lines, 'é o frio'));
    expect(lastWordNums(lines, 'é o frio')).toHaveLength(5);
  });

  it('takes «banana» alone and at the end of a phrase', () => {
    const alone = handwrite('banana', 200);
    expect(kept(alone)).toEqual(alone.map(s => s.num));
    const {strokes, lines} = phrase('eu comi uma banana');
    expect(kept(strokes)).toEqual(lastWordNums(lines, 'eu comi uma banana'));
  });

  it('takes «Cervantes» with its t-bar, on a new page (the cold path)', () => {
    const {strokes, lines} = phrase('Quem foi Miguel de Cervantes');
    const nums = lastWordNums(lines, 'Quem foi Miguel de Cervantes');
    expect(nums).toHaveLength(10);
    expect(kept(strokes)).toEqual(nums);
  });

  it('keeps an i-dot written after the whole word', () => {
    const {strokes} = phrase('é o frio');
    const dot = strokes.find((_, i) => i > 0 && strokes[i - 1].points.length === 40 && _.points.length === 3);
    const reordered = [
      ...strokes.filter(s => s !== dot),
      {...(dot as PageStroke), num: 999},
    ];
    expect(kept(reordered)).toContain(999);
  });

  it('chooses nothing when nothing was written', () => {
    expect(selectWord([], page, NORMAL)).toBeNull();
  });
});

describe('the last line up to the last word (#87)', () => {
  /** The stroke numbers `handwrite` gives each word of `text` on a line of its own. */
  function wordNums(text: string): number[][] {
    const words = text.split(' ');
    return words.map((_, i) => {
      const start = handwrite(words.slice(0, i).join(' '), 0).length;
      const end = handwrite(words.slice(0, i + 1).join(' '), 0).length;
      return Array.from({length: end - start}, (__, k) => 1 + start + k);
    });
  }
  const sorted = (words: number[][] | undefined) =>
    (words ?? []).map(word => [...word].sort((a, b) => a - b));

  it.each([
    'Quem foi Miguel de Cervantes',
    'Who was Ada Lovelace',
    'Quién fue Simón Bolívar',
  ])('splits «%s» into its words, marks with their letters', text => {
    const {strokes} = phrase(text);
    expect(sorted(lineWords(strokes, NORMAL)?.words)).toEqual(wordNums(text));
  });

  it('stops at the line above and ends with the same last word as selectWord', () => {
    const {strokes, lines} = phrase('ontem eu viajei', 'até a China');
    const line = lineWords(strokes, NORMAL);
    expect(line?.words).toHaveLength(3);
    expect(sorted(line?.words).pop()).toEqual(lastWordNums(lines, 'até a China'));
    expect(selectLastWords(strokes, line!, 1, page)?.rect).toEqual(
      selectWord(strokes, page, NORMAL)?.rect,
    );
  });

  it('lassoes the last three words of «Quem foi Miguel de Cervantes» and not «foi»', () => {
    const {strokes} = phrase('Quem foi Miguel de Cervantes');
    const line = lineWords(strokes, NORMAL)!;
    const three = selectLastWords(strokes, line, 3, page)!;
    expect(three.rule).toBe('last words');
    expect(three.strokes).toBe(line.words.slice(-3).flat().length);
    const foi = strokes.filter(s => line.words[1].includes(s.num));
    const foiRight = Math.max(...foi.flatMap(s => s.points.map(p => p.x)));
    expect(three.rect.left).toBeGreaterThan(foiRight);
  });
});

describe('the Word spacing setting scales the measured word gap', () => {
  it('Normal splits the owner’s words and keeps their letters', () => {
    const strokes = handwrite('eu viajei', 200);
    expect(kept(strokes, SPACING_SCALES.normal)).toEqual(
      lastWordNums([strokes], 'eu viajei'),
    );
  });

  it('Tight splits a hand that leaves small gaps between words', () => {
    // Letter gaps of 10–12 px, word gaps of 28–30 px: Normal reads one word.
    const gaps = {letter: [10, 12, 11], word: [28, 30]};
    const strokes = handwrite('eu viajei', 200, 1, gaps);
    const last = strokes.slice(2).map(s => s.num);
    expect(kept(strokes, SPACING_SCALES.normal)).toEqual(strokes.map(s => s.num));
    expect(kept(strokes, SPACING_SCALES.tight)).toEqual(last);
  });

  it('Wide keeps a word whose letters are far apart', () => {
    // One 40 px gap inside «banana», word gaps of 60 px: Normal cuts «banana» at the 40 px gap.
    const gaps = {letter: [10, 12, 40, 11, 10], word: [60]};
    const strokes = handwrite('eu banana', 200, 1, gaps);
    const banana = strokes.slice(2).map(s => s.num);
    expect(kept(strokes, SPACING_SCALES.normal)).not.toEqual(banana);
    expect(kept(strokes, SPACING_SCALES.wide)).toEqual(banana);
  });

  it('measures every gap as a ratio of the line', () => {
    const measures = lineMeasures([36, 36, 76], [8, 12, 10, 55], 1);
    expect(measures.height).toBe(36);
    expect(measures.letterGap).toBe(10);
    expect(measures.wordGap).toBe(30);
    expect(lineMeasures([72, 72], [16, 24, 20, 110], 1).wordGap).toBe(60);
  });
});

describe('the newest line after larger strokes (#109)', () => {
  it('lassoes a small word written after a large heading, not the heading', () => {
    const heading = Array.from({length: 12}, (_, i) =>
      stroke(i + 1, {left: 100 + i * 80, top: 100, right: 160 + i * 80, bottom: 200}),
    );
    const word = Array.from({length: 4}, (_, i) =>
      stroke(i + 13, {left: 100 + i * 40, top: 400, right: 134 + i * 40, bottom: 440}),
    );
    expect(kept([...heading, ...word], NORMAL)).toEqual([13, 14, 15, 16]);
  });

  it('lassoes «cat» written after a drawing, not the drawing', () => {
    const drawing = Array.from({length: 20}, (_, i) =>
      stroke(i + 1, {left: 100 + (i % 10) * 90, top: 1000 + (i % 3) * 20, right: 180 + (i % 10) * 90, bottom: 1150}),
    );
    const cat = handwrite('cat', 1400, 21);
    expect(kept([...drawing, ...cat], NORMAL)).toEqual(cat.map(s => s.num));
  });
});

describe('the lasso rect', () => {
  it('pads a one-letter rect to the size lassoElements took on the device', () => {
    // 53 × 52 was refused on build 15 and 88 × 52 taken.
    const rect = padToPage({left: 785, top: 2244, right: 838, bottom: 2296}, 36, page);
    expect(rect.right - rect.left).toBeGreaterThanOrEqual(36 * LASSO_MIN_SHARE);
    expect(rect.right - rect.left).toBeGreaterThanOrEqual(88);
    expect(rect.left).toBeLessThan(785);
    expect(rect.right).toBeGreaterThan(838);
  });

  it('gives one dot a lasso lassoElements takes, never 0 × 0 (#109)', () => {
    const rect = padToPage({left: 500, top: 700, right: 500, bottom: 700}, 0, page);
    expect(rect.right - rect.left).toBeGreaterThanOrEqual(LASSO_MIN_SIDE);
    expect(rect.bottom - rect.top).toBeGreaterThanOrEqual(LASSO_MIN_SIDE);
    const dot = selectWord([stroke(1, {left: 500, top: 700, right: 500, bottom: 700}, 1)], page, NORMAL);
    expect(dot).not.toBeNull();
    expect(dot!.rect.right - dot!.rect.left).toBeGreaterThanOrEqual(88);
    expect(dot!.rect.bottom - dot!.rect.top).toBeGreaterThanOrEqual(88);
  });

  it('keeps the lasso inside the page, as lassoElements requires', () => {
    expect(
      padToPage({left: 2, top: 3, right: 1919, bottom: 2559}, 36, page),
    ).toEqual({left: 0, top: 0, right: 1920, bottom: 2560});
  });
});

function ellipse(num: number, cx: number, cy: number, rx: number, ry: number, turn = 1): PageStroke {
  const points = Array.from({length: 40}, (_, i) => {
    const angle = (2 * Math.PI * turn * i) / 39;
    return {x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle)};
  });
  return {num, points};
}

describe('the circle rule', () => {
  it('takes the strokes inside a circle drawn around them', () => {
    const before = handwrite('eu', 100);
    const soup = handwrite('sopa', 100, 10).map(s => ({
      ...s,
      points: s.points.map(p => ({x: p.x + 300, y: p.y})),
    }));
    const circle = ellipse(99, 475, 118, 140, 75);
    const choice = wordInCircle([...before, ...soup], circle, page);
    expect(choice?.rule).toBe('circle');
    expect(choice?.verdicts.filter(v => v.kept).map(v => v.num)).toEqual(soup.map(s => s.num));
  });

  it('reads an open curve as handwriting, not as a circle', () => {
    const arc = ellipse(99, 475, 120, 140, 60, 0.5);
    expect(isClosedLoop(arc.points)).toBe(false);
    expect(wordInCircle(handwrite('sopa', 100), arc, page)).toBeNull();
  });

  it('knows a point inside a loop from one outside it', () => {
    const loop = ellipse(1, 0, 0, 10, 10).points;
    expect(insideLoop({x: 0, y: 0}, loop)).toBe(true);
    expect(insideLoop({x: 20, y: 0}, loop)).toBe(false);
  });
});
