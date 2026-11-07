import {PluginCommAPI, PluginFileAPI, PluginManager} from 'sn-plugin-lib';
import {
  lassoLastWord,
  probeIdle,
  runProbe,
  stopPenProbe,
} from '../src/flow/penProbe';
import {logLines, startLog} from '../src/log/memory';
import {getPenInfo, strokePoints} from '../src/sdk/pen';

const mocked = (fn: unknown) => fn as jest.Mock;
const success = (result: unknown) => ({success: true, result});

type Point = {x: number; y: number};

/** An element as the SDK hands it over, with its points behind an accessor. */
function strokeElement(points: Point[], numInPage = 1) {
  return {
    uuid: 'u',
    type: 0,
    numInPage,
    stroke: {
      points: {
        size: async () => points.length,
        getRange: async (start: number, count: number) =>
          points.slice(start, start + count),
      },
    },
    recycle: jest.fn(async () => {}),
  };
}

function zigzag(left: number): Point[] {
  return Array.from({length: 11}, (_, i) => ({
    x: left + i * 4,
    y: 100 + (i % 2) * 40,
  }));
}

function circle(): Point[] {
  return Array.from({length: 40}, (_, i) => {
    const angle = (2 * Math.PI * i) / 39;
    return {x: 175 + 140 * Math.cos(angle), y: 120 + 60 * Math.sin(angle)};
  });
}

let penUp: (msg: unknown) => void = () => {};

beforeEach(() => {
  jest.resetAllMocks();
  stopPenProbe();
  startLog();
  mocked(PluginManager.registerEventListener).mockImplementation(
    (_event: string, _order: number, listener: {onMsg: typeof penUp}) => {
      penUp = listener.onMsg;
      return {remove: jest.fn()};
    },
  );
  mocked(PluginManager.registerMotionListener).mockReturnValue({
    remove: jest.fn(),
  });
  mocked(PluginCommAPI.getCurrentFilePath).mockResolvedValue(
    success('/Note/a.note'),
  );
  mocked(PluginCommAPI.getCurrentPageNum).mockResolvedValue(success(0));
  mocked(PluginFileAPI.getPageSize).mockResolvedValue(
    success({width: 1920, height: 2560}),
  );
  mocked(PluginCommAPI.getPenInfo).mockResolvedValue(
    success({type: 10, color: 0, width: 200}),
  );
  mocked(PluginCommAPI.lassoElements).mockResolvedValue(success(true));
  mocked(PluginCommAPI.getLassoRect).mockResolvedValue(success({left: 0}));
  mocked(PluginCommAPI.getLassoElements).mockResolvedValue(success([]));
  mocked(PluginManager.closePluginView).mockResolvedValue(true);
});

afterEach(() => stopPenProbe());

async function write(points: Point[], numInPage = 1) {
  mocked(PluginFileAPI.getLastElement).mockResolvedValueOnce(
    success(strokeElement(points, numInPage)),
  );
  penUp([{type: 0, numInPage: 1, uuid: 'u'}]);
  await probeIdle();
}

it('lassoes the strokes inside a circle the person draws, with the view closed', async () => {
  mocked(PluginFileAPI.getElements).mockResolvedValue(success([]));
  await runProbe();
  mocked(PluginCommAPI.lassoElements).mockClear();
  const letters = [strokeElement(zigzag(100), 1), strokeElement(zigzag(150), 2)];
  mocked(PluginFileAPI.getElements).mockResolvedValue(success(letters));
  await write(zigzag(100), 1);
  await write(zigzag(150), 2);
  expect(PluginCommAPI.lassoElements).not.toHaveBeenCalled();
  await write(circle(), 3);
  // The two letters, 40 px high, padded by a quarter of that and grown to 2.5 letter heights high.
  expect(PluginCommAPI.lassoElements).toHaveBeenCalledWith({
    left: 90,
    top: 70,
    right: 200,
    bottom: 170,
  });
  expect(logLines().join('\n')).toMatch(/probe word: rule circle, 2 stroke/);
  expect(logLines().join('\n')).toMatch(/getPenInfo \(after the lasso\) -> ok/);
});

/** «de Cervantes» on a new page, one stroke per letter, as the page lists them (#75). */
function cervantes() {
  const box = (left: number, top: number, right: number, bottom: number) =>
    Array.from({length: 11}, (_, i) => ({
      x: left + ((right - left) * i) / 10,
      y: i % 2 === 0 ? top : bottom,
    }));
  const rects: [number, number, number, number][] = [
    [100, 160, 134, 236], // d
    [146, 200, 180, 236], // e
    [240, 160, 295, 236], // C
    [303, 200, 337, 236], // e
    [349, 200, 383, 236], // r
    [393, 200, 427, 236], // v
    [445, 200, 479, 236], // a
    [485, 200, 519, 236], // n
    [531, 175, 565, 236], // t
    [519, 202, 577, 207], // t-bar
    [583, 200, 617, 236], // e
    [626, 200, 660, 236], // s
  ];
  return rects.map((rect, i) => strokeElement(box(...rect), 40 + i));
}

it('lassoes the last word from the page’s strokes with no Probe armed, and recycles them', async () => {
  const elements = cervantes();
  mocked(PluginFileAPI.getElements).mockResolvedValue(success(elements));
  expect(await lassoLastWord()).toBeNull();
  expect(PluginFileAPI.getElements).toHaveBeenCalledWith(0, '/Note/a.note');
  expect(PluginCommAPI.lassoElements).toHaveBeenCalledWith({
    left: 231,
    top: 151,
    right: 669,
    bottom: 245,
  });
  for (const element of elements) {
    expect(element.recycle).toHaveBeenCalled();
  }
  const text = logLines().join('\n');
  expect(text).toMatch(/probe word: rule last word, 10 stroke\(s\).*spacing normal/);
  expect(text).toMatch(/probe line stroke #40 rect .* letter, left out/);
  expect(text).toMatch(/probe line stroke #49 rect .* letter, kept/);
  expect(PluginManager.closePluginView).toHaveBeenCalled();
});

it('says so and keeps the view when lassoElements does not take the rect', async () => {
  mocked(PluginFileAPI.getElements).mockResolvedValue(success(cervantes()));
  mocked(PluginCommAPI.lassoElements).mockResolvedValue(success(false));
  expect(await lassoLastWord()).toBe('lassoFailed');
  expect(PluginCommAPI.getLassoRect).not.toHaveBeenCalled();
  expect(PluginManager.closePluginView).not.toHaveBeenCalled();
  expect(logLines().join('\n')).toMatch(/lassoElements did not take the rect/);
});

it('logs a lassoed picture’s fields and closes the view after the lasso', async () => {
  const picture = {
    uuid: 'p',
    type: 200,
    numInPage: 3,
    picture: {
      picturePath: '/MyStyle/Ink2Pic/a.png',
      rect: {left: 1, top: 2, right: 3, bottom: 4},
    },
  };
  mocked(PluginFileAPI.getElements).mockResolvedValue(success([picture]));
  mocked(PluginCommAPI.getLassoElements).mockResolvedValue(success([picture]));
  await runProbe();
  expect(PluginCommAPI.lassoElements).toHaveBeenCalledWith(
    picture.picture.rect,
  );
  const text = logLines().join('\n');
  expect(text).toMatch(
    /probe lasso picture: keys .*picture.*\/MyStyle\/Ink2Pic\/a\.png/,
  );
  const order = mocked(PluginCommAPI.lassoElements).mock.invocationCallOrder[0];
  expect(
    mocked(PluginManager.closePluginView).mock.invocationCallOrder[0],
  ).toBeGreaterThan(order);
});

it('lassoes nothing and keeps the view when no stroke was written', async () => {
  mocked(PluginFileAPI.getElements).mockResolvedValue(success([]));
  expect(await lassoLastWord()).toBe('noStrokes');
  expect(PluginCommAPI.lassoElements).not.toHaveBeenCalled();
  expect(PluginManager.closePluginView).not.toHaveBeenCalled();
});

it('reads a bare PenInfo as well as an APIResponse', async () => {
  mocked(PluginCommAPI.getPenInfo).mockResolvedValueOnce({
    type: 16,
    color: 0,
    width: 100,
  });
  expect(await getPenInfo()).toEqual({
    ok: true,
    value: {type: 16, color: 0, width: 100},
  });
});

it('reads a stroke’s points in parts and none for another element', async () => {
  const points = zigzag(0);
  expect(await strokePoints(strokeElement(points))).toEqual({
    ok: true,
    value: points,
  });
  expect(await strokePoints({type: 200})).toEqual({ok: true, value: []});
});
