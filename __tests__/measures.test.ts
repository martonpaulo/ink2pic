import {
  isContourUri,
  measureFirstPages,
  MeasureDeps,
  measureThumb,
} from '../src/flow/measure';
import {logLines, startLog} from '../src/log/memory';
import {ok, fail, MODULE_CODE} from '../src/sdk/result';
import {
  isFaintLines,
  lineArt,
  Measures,
  needsContour,
  pixelKind,
  pixelScorer,
  reorderByMeasures,
} from '../src/search-core/measures';
import {cachedSearch} from '../src/search-core/cache';
import {readIntent} from '../src/search-core/query';
import type {SearchResult} from '../src/search-core/types';

/** A white page; each picture below changes what it needs. */
const paper: Measures = {
  width: 400,
  height: 400,
  mean: 255,
  dark: 0,
  white: 1,
  mid: 0,
  border: 1,
  borderMedian: 255,
  ink: 0,
  inkLeft: 0,
  inkTop: 0,
  inkWidth: 0,
  inkHeight: 0,
  bands: 0,
  lineAspect: 0,
  thickness: 0,
  edge: 0,
  edgeBox: 0,
  colours: 1,
  objectShare: 0,
  fragments: 0,
  darkest: 0,
  faintLines: false,
  ms: 2,
};

/** Values in the range the research measured on real thumbnails (sections 4 and D 3). */
const outline: Measures = {
  ...paper,
  mean: 227,
  dark: 0.1,
  white: 0.85,
  mid: 0.05,
  border: 0.91,
  ink: 0.11,
  inkWidth: 300,
  inkHeight: 320,
  bands: 1,
  lineAspect: 0.9,
  thickness: 2.5,
  edge: 0.23,
  edgeBox: 0.6,
  colours: 12,
  objectShare: 0.12,
};
const darkPainting: Measures = {
  ...paper,
  mean: 35,
  dark: 0.79,
  white: 0,
  // Mid grays are 41 to 214: a dark painting has many between 41 and 80.
  mid: 0.55,
  border: 0,
  borderMedian: 30,
  ink: 0,
  edge: 0.12,
  edgeBox: 0.95,
  colours: 900,
  objectShare: 0.6,
};
const photo: Measures = {
  ...darkPainting,
  mean: 104,
  dark: 0.38,
  mid: 0.62,
  borderMedian: 110,
  ink: 0.3,
  thickness: 9,
};
const signature: Measures = {
  ...outline,
  mean: 235,
  white: 0.89,
  border: 0.96,
  ink: 0.08,
  inkWidth: 380,
  inkHeight: 55,
  lineAspect: 6.9,
};
const faint: Measures = {
  ...outline,
  mean: 251,
  dark: 0,
  white: 0.94,
  border: 0.96,
  ink: 0,
  objectShare: 0.05,
};
const glossy: Measures = {
  ...outline,
  mean: 141,
  dark: 0.46,
  white: 0.33,
  mid: 0.21,
  border: 0.81,
  ink: 0.54,
  thickness: 20,
  colours: 400,
};
const blank: Measures = {...paper, objectShare: 0.001};

const result = (id: string, title = id, canonical = false): SearchResult => ({
  id,
  source: 'openclipart',
  title,
  thumbUrl: `https://example.test/${id}`,
  license: 'CC0 1.0',
  attribution: 'x',
  ...(canonical ? {canonical} : {}),
});

describe('pixelKind (#66)', () => {
  it('names each kind the research separates', () => {
    expect(pixelKind(outline)).toBe('outline');
    expect(pixelKind(darkPainting)).toBe('dark');
    expect(pixelKind(photo)).toBe('photo');
    expect(pixelKind(signature)).toBe('text');
    expect(pixelKind(faint)).toBe('faint');
    expect(pixelKind(blank)).toBe('blank');
    const light = {...glossy, dark: 0.2, ink: 0.2};
    expect(pixelKind({...light, border: 0.86, white: 0.4})).toBe('clean');
    expect(pixelKind(light)).toBe('plain');
  });

  it('names dark clip art on paper solid: a silhouette, a dark shaded apple (#81)', () => {
    expect(pixelKind(glossy)).toBe('solid');
    // A silhouette under the dark share, known by its thick solid fill.
    expect(
      pixelKind({...outline, dark: 0.27, ink: 0.27, thickness: 28, white: 0.7}),
    ).toBe('solid');
    // Thick line art (a clock face) stays as it is.
    expect(
      pixelKind({...outline, dark: 0.19, ink: 0.3, thickness: 7.8, white: 0.7}),
    ).not.toBe('solid');
  });
});

describe('faint line work (#81)', () => {
  const map = {...outline, darkest: 190, faintLines: true};

  it('reads the native rule: light-grey lines on paper', () => {
    expect(isFaintLines(map)).toBe(true);
    expect(isFaintLines(outline)).toBe(false);
  });

  it('ranks a picture still faint after the clear ones', () => {
    const scorer = pixelScorer(
      new Map([
        ['still', map],
        ['clear', outline],
        ['thin', faint],
      ]),
    );
    const intent = readIntent('spain');
    const score = (id: string) => scorer(result(id), intent);
    expect(score('still')).toBeLessThan(score('clear'));
    expect(score('thin')).toBeLessThan(score('clear'));
  });
});

describe('needsContour (#66, owner decision D5 A)', () => {
  it('converts dark pictures and photos only', () => {
    expect(needsContour(darkPainting, 'cervantes')).toBe(true);
    expect(needsContour(photo, 'jesse jackson')).toBe(true);
    expect(needsContour(outline, 'cat')).toBe(false);
    expect(needsContour({...glossy, dark: 0.2, ink: 0.2}, 'apple')).toBe(false);
  });

  it('never converts a few flat areas: a three-band flag keeps its grey (#89)', () => {
    // Red, yellow, red: three flat bands that fill the frame, few colours, edges only between them.
    const flag: Measures = {
      ...photo,
      colours: 24,
      edge: 0.03,
      mid: 0.95,
      border: 0,
      dark: 0,
    };
    expect(pixelKind(flag)).toBe('photo');
    expect(needsContour(flag, 'spain')).toBe(false);
    // A one-tone silhouette still becomes its outline (#81).
    expect(
      needsContour({...glossy, colours: 16, edge: 0.05, mid: 0.02}, 'apple'),
    ).toBe(true);
  });

  it('converts dark clip art too: «apple» shows no black silhouette (#81)', () => {
    expect(needsContour(glossy, 'apple')).toBe(true);
    expect(needsContour(glossy, 'apple photo')).toBe(false);
  });

  it('converts every picture not already line work when the query asks for an outline', () => {
    expect(needsContour(glossy, 'apple outline')).toBe(true);
    expect(needsContour(glossy, 'apple coloring page')).toBe(true);
    expect(needsContour(outline, 'cat drawing')).toBe(false);
    expect(needsContour(signature, 'einstein drawing')).toBe(false);
  });

  it('converts nothing when the query asks for a photo or a painting', () => {
    expect(needsContour(darkPainting, 'mona lisa painting')).toBe(false);
    expect(needsContour(photo, 'cat photo')).toBe(false);
  });
});

describe('lineArt (#66)', () => {
  it('scores clean outlines above glossy clip art, photos and dark paintings', () => {
    expect(lineArt(outline)).toBeGreaterThan(lineArt(glossy));
    expect(lineArt(glossy)).toBeGreaterThan(lineArt(photo));
    expect(lineArt(outline)).toBeGreaterThan(lineArt(darkPainting));
  });

  it('takes points from a solid fill and from faint lines', () => {
    expect(lineArt({...glossy, thickness: 10})).toBeGreaterThan(
      lineArt(glossy),
    );
    expect(lineArt(faint)).toBeLessThan(lineArt({...faint, white: 0.89}));
  });
});

describe('pixelScorer (#66)', () => {
  it('scales line art from 0 to 3 within the set and gives a canonical picture 0', () => {
    const measures = new Map([
      ['a', outline],
      ['b', darkPainting],
      ['c', glossy],
    ]);
    const pixels = pixelScorer(measures);
    // A scorer of the ranker: it reads no query.
    const score = (r: SearchResult) => pixels(r, readIntent(''));
    expect(score(result('a'))).toBe(3);
    expect(score(result('b'))).toBe(0);
    expect(score(result('c'))).toBeGreaterThan(0);
    expect(score(result('c'))).toBeLessThan(3);
    expect(score(result('a', 'a', true))).toBe(0);
    expect(score(result('unmeasured'))).toBe(1.5);
  });
});

describe('reorderByMeasures (#66)', () => {
  const ids = (list: SearchResult[]) => list.map(item => item.id);

  it('moves an outline above a dark painting of the same title score', () => {
    const list = [result('dark'), result('line')];
    const measures = new Map([
      ['dark', darkPainting],
      ['line', outline],
    ]);
    expect(ids(reorderByMeasures(list, measures))).toEqual(['line', 'dark']);
  });

  it('keeps the title score: three points of line art do not beat a better title by more', () => {
    const list = [
      result('cat', 'Cat'),
      result('other', 'Cat on a roof at night'),
    ];
    const measures = new Map([
      ['cat', darkPainting],
      ['other', outline],
    ]);
    // Plain subject +3 against mention +1: the outline's +3 wins by one.
    expect(ids(reorderByMeasures(list, measures, 'cat'))).toEqual([
      'other',
      'cat',
    ]);
    expect(
      ids(reorderByMeasures(list, new Map([['cat', outline]]), 'cat')),
    ).toEqual(['cat', 'other']);
  });

  it('ranks a photo as a drawing in the measured order under «Photos too» (#70, #92)', () => {
    const list = [result('photo', 'Cat photo'), result('plain', 'Cat')];
    const measures = new Map([
      ['photo', outline],
      ['plain', outline],
    ]);
    expect(ids(reorderByMeasures(list, measures, 'cat'))).toEqual([
      'plain',
      'photo',
    ]);
    expect(
      ids(reorderByMeasures(list, measures, 'cat', new Set(), true)),
    ).toEqual(['photo', 'plain']);
  });

  it('puts a contour drawing after a picture shown as found, text and faint lines last (#83)', () => {
    const list = [
      result('poster', 'Cat'),
      result('photo', 'Cat'),
      result('drawing', 'Cat'),
    ];
    const measures = new Map([
      ['poster', signature],
      ['photo', outline],
      ['drawing', {...outline, white: 0.5}],
    ]);
    expect(
      ids(reorderByMeasures(list, measures, 'cat', new Set(['photo']))),
    ).toEqual(['drawing', 'photo', 'poster']);
  });

  it('sends a picture shown near-black past page 2 unless a photo is asked (#83)', () => {
    const list = [result('poster', 'Cat'), result('line', 'Roof')];
    const measures = new Map([
      ['poster', darkPainting],
      ['line', outline],
    ]);
    expect(ids(reorderByMeasures(list, measures, 'cat'))).toEqual([
      'line',
      'poster',
    ]);
    expect(ids(reorderByMeasures(list, measures, 'cat photo'))).toEqual([
      'poster',
      'line',
    ]);
  });

  it('keeps a canonical picture at its index, also when it is a dark painting shown as its contour', () => {
    const list = [
      result('best'),
      result('wikidata', 'wikidata', true),
      result('dark'),
      result('line'),
    ];
    const measures = new Map([
      ['best', darkPainting],
      ['wikidata', {...outline, colours: 16}],
      ['dark', darkPainting],
      ['line', outline],
    ]);
    expect(
      ids(reorderByMeasures(list, measures, '', new Set(['wikidata']))),
    ).toEqual(['line', 'wikidata', 'best', 'dark']);
  });

  it('gives a cached search the measured order of the live one (#99)', async () => {
    const live = [
      result('best'),
      result('wikidata', 'wikidata', true),
      result('line'),
    ];
    const measures = new Map([
      ['best', photo],
      ['wikidata', photo],
      ['line', outline],
    ]);
    const files: Record<string, string> = {};
    const storage = {
      readText: async (path: string) => files[path] ?? null,
      writeText: async (path: string, text: string) => {
        files[path] = text;
      },
    };
    const run = async () => ({
      results: live,
      statuses: {},
      sourceDown: false,
      allFailed: false,
    });
    const options = {storage, path: '/plugin/search-cache.json'};
    await (
      await cachedSearch('cat', run, options)
    ).saved;
    // A new runtime reads the file, not the memory of the first.
    const cached = await cachedSearch('cat', run, {
      ...options,
      storage: {...storage},
    });
    expect(cached.freshness).toBe('fresh');
    const order = (list: SearchResult[]) =>
      ids(reorderByMeasures(list, measures, 'cat'));
    expect(order(cached.outcome.results)).toEqual(order(live));
    expect(order(live)).toEqual(['line', 'wikidata', 'best']);
  });

  it('sends a canonical picture shown near-black past page 2 too (#83)', () => {
    const list = [
      result('wikidata', 'wikidata', true),
      result('line'),
      result('other'),
    ];
    const measures = new Map([
      ['wikidata', darkPainting],
      ['line', outline],
    ]);
    expect(ids(reorderByMeasures(list, measures))).toEqual([
      'line',
      'other',
      'wikidata',
    ]);
  });

  it('leaves page 3 and later in their order and sends a blank thumbnail to the end', () => {
    const list = Array.from({length: 15}, (_, i) => result(`r${i}`));
    const measures = new Map<string, Measures>([
      ['r0', blank],
      ['r1', darkPainting],
      ['r11', outline],
    ]);
    const ordered = ids(reorderByMeasures(list, measures));
    expect(ordered[0]).toBe('r11');
    // r12 and r13 are on page 3: not re-sorted, they move up to fill the slots of the blank and
    // the near-black one (#83), which go to the end.
    expect(ordered.slice(10)).toEqual(['r12', 'r13', 'r14', 'r0', 'r1']);
    expect(new Set(ordered).size).toBe(15);
  });

  it('changes nothing without measures', () => {
    const list = [result('b', 'Photo of b'), result('a')];
    expect(ids(reorderByMeasures(list, new Map()))).toEqual(['b', 'a']);
  });
});

describe('measureFirstPages (#66)', () => {
  const list = [
    result('dark'),
    result('web'),
    result('gloss'),
    result('line'),
    result('bad'),
  ];
  const byPath: Record<string, Measures> = {
    '/p/thumbs/dark': darkPainting,
    '/p/thumbs/line': outline,
    // Light enough to stay as it is (#81).
    '/p/thumbs/gloss': {...glossy, dark: 0.2, ink: 0.2},
    // The dark painting's contour: thin lines on white.
    '/p/thumbs/dark.contour.png': {...outline, colours: 16},
  };
  const converted: string[] = [];
  const deps = (limitMs = 1000): MeasureDeps => ({
    analyzer: {
      measure: async path =>
        byPath[path]
          ? ok(byPath[path])
          : fail(MODULE_CODE, 'NOT_IMAGE: cannot decode', 'NOT_IMAGE'),
      toContour: async (src, dest, width) => {
        converted.push(`${src} -> ${dest} at ${width}`);
        return ok({width: 330, height: 400, ms: 7});
      },
    },
    thumb: async item =>
      item.id === 'web' ? item.thumbUrl : `file:///p/thumbs/${item.id}`,
    limitMs,
  });

  beforeEach(() => {
    startLog();
    converted.length = 0;
  });

  it('re-sorts by the measured files and logs each kind', async () => {
    const measured = await measureFirstPages(list, '/p', 'x', deps());
    // The dark painting shows as its contour drawing: after the pictures shown as found (#83).
    expect(measured.results.map(item => item.id)).toEqual([
      'line',
      'web',
      'bad',
      'gloss',
      'dark',
    ]);
    expect([...measured.measures.keys()].sort()).toEqual([
      'dark',
      'gloss',
      'line',
    ]);
    const text = logLines().join('\n');
    expect(text).toMatch(/pixels line: outline lineArt \d\.\d\d in 2 ms/);
    expect(text).toContain('pixels dark: dark');
    expect(text).toContain('pixels web: not on the device, not measured');
    expect(text).toContain('pixels bad: NOT_IMAGE: cannot decode');
    expect(text).toContain('pixels: 3 of 5 measured');
    expect(text).toContain('contour dark: 7 ms, now outline');
  });

  it('shows and inserts a dark picture as its contour drawing', async () => {
    const measured = await measureFirstPages(list, '/p', 'x', deps());
    expect(converted).toEqual([
      '/p/thumbs/dark -> /p/thumbs/dark.contour.png at 400',
    ]);
    expect(measured.contourThumbs.get('dark')).toBe(
      'file:///p/thumbs/dark.contour.png',
    );
    expect(isContourUri(measured.contourThumbs.get('dark') ?? '')).toBe(true);
    expect(measured.contourThumbs.has('line')).toBe(false);
  });

  it('shows a picture as found when its contour is mostly speckle (#83)', async () => {
    const base = deps();
    const measured = await measureFirstPages(list, '/p', 'x', {
      ...base,
      analyzer: {
        ...base.analyzer,
        measure: async path =>
          path === '/p/thumbs/dark.contour.png'
            ? ok({...outline, fragments: 0.6})
            : base.analyzer.measure(path),
      },
    });
    expect(converted).toEqual([
      '/p/thumbs/dark -> /p/thumbs/dark.contour.png at 400',
    ]);
    expect(measured.contourThumbs.has('dark')).toBe(false);
    expect(logLines().join('\n')).toContain(
      'contour dark: speckled, shown as found',
    );
  });

  it('shows faint light-grey lines darkened, inserted darkened, not as a contour (#81)', async () => {
    const map = {...outline, darkest: 190, faintLines: true};
    const darkened: string[] = [];
    const base = deps();
    const measured = await measureFirstPages(
      [result('map'), result('line')],
      '/p',
      'spain',
      {
        ...base,
        analyzer: {
          ...base.analyzer,
          measure: async path =>
            path === '/p/thumbs/map'
              ? ok(map)
              : path === '/p/thumbs/map.dark.png'
              ? ok({...map, darkest: 0, faintLines: false})
              : base.analyzer.measure(path),
          darken: async (src, dest, width) => {
            darkened.push(`${src} -> ${dest} at ${width}`);
            return ok({width: 330, height: 400, ms: 5});
          },
        },
      },
    );
    expect(darkened).toEqual([
      '/p/thumbs/map -> /p/thumbs/map.dark.png at 400',
    ]);
    expect(converted).toEqual([]);
    const shown = measured.contourThumbs.get('map') ?? '';
    expect(shown).toBe('file:///p/thumbs/map.dark.png');
    expect(isContourUri(shown)).toBe(false);
    expect(measured.measures.get('map')?.darkest).toBe(0);
  });

  it('shows every measured picture as its contour drawing under All contour (#70)', async () => {
    const measured = await measureFirstPages(list, '/p', 'x', {
      ...deps(),
      allContour: async () => true,
    });
    expect(converted.sort()).toEqual([
      '/p/thumbs/dark -> /p/thumbs/dark.contour.png at 400',
      '/p/thumbs/gloss -> /p/thumbs/gloss.contour.png at 400',
      '/p/thumbs/line -> /p/thumbs/line.contour.png at 400',
    ]);
    expect(measured.contourThumbs.has('line')).toBe(true);
  });

  it('writes derived thumbnails to the private thumbs folder, never beside a shared symbol (#103)', async () => {
    const symbol = '/storage/emulated/0/MyStyle/Ink2Pic/symbols/1F600.png';
    const greyLines = {...outline, darkest: 190, faintLines: true};
    const darkened: string[] = [];
    const base = deps();
    const shared = {
      ...base,
      thumb: async (item: SearchResult) =>
        `file://${item.id === 'openmoji:1F600' ? symbol : `/p/thumbs/${item.id}`}`,
      analyzer: {
        ...base.analyzer,
        measure: async (path: string) =>
          path === symbol ? ok(greyLines) : base.analyzer.measure(path),
        darken: async (src: string, dest: string, width: number) => {
          darkened.push(`${src} -> ${dest} at ${width}`);
          return ok({width: 330, height: 400, ms: 5});
        },
      },
    };
    const moji = {...result('openmoji:1F600'), source: 'openmoji' as const};
    await measureFirstPages([moji], '/p', 'smile', shared);
    expect(darkened).toEqual([
      `${symbol} -> /p/thumbs/openmoji-1F600.dark.png at 400`,
    ]);
    expect(
      await measureThumb(moji, '/p', 'smile', {
        ...shared,
        allContour: async () => true,
      }),
    ).toBe('file:///p/thumbs/openmoji-1F600.contour.png');
    expect(converted).toEqual([
      `${symbol} -> /p/thumbs/openmoji-1F600.contour.png at 400`,
    ]);
  });

  it('shows and inserts the picture as it is when the conversion fails', async () => {
    const failing = deps();
    failing.analyzer = {
      ...failing.analyzer,
      toContour: async () => fail(MODULE_CODE, 'IO: disk full', 'IO'),
    };
    const measured = await measureFirstPages(list, '/p', 'x', failing);
    expect(measured.contourThumbs.has('dark')).toBe(false);
    expect(measured.measures.get('dark')).toBe(darkPainting);
    expect(logLines().join('\n')).toContain('contour dark: IO: disk full');
  });

  it('changes nothing without a thumbnail folder', async () => {
    const measured = await measureFirstPages(list, null, 'x', deps());
    expect(measured.results).toBe(list);
  });

  it('shows the page at the limit with what was measured by then', async () => {
    const slow: MeasureDeps = {
      ...deps(5),
      thumb: item =>
        item.id === 'line'
          ? Promise.resolve('file:///p/thumbs/line')
          : new Promise(() => {}),
    };
    const measured = await measureFirstPages(list, '/p', 'x', slow);
    expect([...measured.measures.keys()]).toEqual(['line']);
    expect(logLines().join('\n')).toContain('limit reached');
  });

  describe('the early-download hook of Insert picture (#88)', () => {
    it('runs once every thumbnail is on the device, before the order is returned', async () => {
      const events: string[] = [];
      const thumbs = deps();
      const watched: MeasureDeps = {
        ...thumbs,
        thumb: async (item, dir) => {
          const uri = await thumbs.thumb(item, dir);
          events.push(`thumb ${item.id}`);
          return uri;
        },
      };
      const measured = await measureFirstPages(list, '/p', 'x', watched, () =>
        events.push('hook'),
      );
      events.push('returned');
      expect(events.indexOf('hook')).toBe(list.length);
      expect(events.filter(event => event === 'hook')).toHaveLength(1);
      expect(events[events.length - 1]).toBe('returned');
      // The order is the one without the hook: it never changes the winner.
      const without = await measureFirstPages(list, '/p', 'x', deps());
      expect(measured.results).toEqual(without.results);
      expect(measured.measures).toEqual(without.measures);
      expect(measured.contourThumbs).toEqual(without.contourThumbs);
    });

    it('never runs after the limit returned the order', async () => {
      let finish: (uri: string) => void = () => {};
      const slow: MeasureDeps = {
        ...deps(5),
        thumb: item =>
          item.id === 'line'
            ? Promise.resolve('file:///p/thumbs/line')
            : new Promise(resolve => {
                finish = resolve;
              }),
      };
      const hook = jest.fn();
      await measureFirstPages(list, '/p', 'x', slow, hook);
      finish('file:///p/thumbs/gloss');
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(hook).not.toHaveBeenCalled();
    });
  });
  describe('a later page, as it loads (#72)', () => {
    it('shows and inserts a dark picture as its contour drawing', async () => {
      expect(await measureThumb(result('dark'), '/p', 'x', deps())).toBe(
        'file:///p/thumbs/dark.contour.png',
      );
      expect(converted).toEqual([
        '/p/thumbs/dark -> /p/thumbs/dark.contour.png at 400',
      ]);
      expect(logLines().join('\n')).toContain(
        'contour dark: 7 ms, now outline',
      );
    });

    it('shows an outline, a failed measure and a web thumbnail as found', async () => {
      expect(await measureThumb(result('line'), '/p', 'x', deps())).toBe(
        'file:///p/thumbs/line',
      );
      expect(await measureThumb(result('bad'), '/p', 'x', deps())).toBe(
        'file:///p/thumbs/bad',
      );
      expect(await measureThumb(result('web'), '/p', 'x', deps())).toBe(
        result('web').thumbUrl,
      );
      expect(converted).toEqual([]);
    });

    it('shows the picture as found when the conversion fails', async () => {
      const failing = deps();
      failing.analyzer = {
        ...failing.analyzer,
        toContour: async () => fail(MODULE_CODE, 'IO: disk full', 'IO'),
      };
      expect(await measureThumb(result('dark'), '/p', 'x', failing)).toBe(
        'file:///p/thumbs/dark',
      );
    });

    it('shows the picture as found at the limit, and a later contour changes nothing', async () => {
      let finish!: () => void;
      const slow = deps(5);
      slow.analyzer = {
        ...slow.analyzer,
        measure: () =>
          new Promise(resolve => {
            finish = () => resolve(ok(darkPainting));
          }),
      };
      expect(await measureThumb(result('dark'), '/p', 'x', slow)).toBe(
        'file:///p/thumbs/dark',
      );
      expect(logLines().join('\n')).toContain('pixels dark: limit reached');
      finish();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(converted).toEqual([]);
    });

    it('never rejects', async () => {
      const broken: MeasureDeps = {
        ...deps(),
        thumb: () => Promise.reject(new Error('no disk')),
      };
      expect(await measureThumb(result('dark'), '/p', 'x', broken)).toBe(
        result('dark').thumbUrl,
      );
    });
  });
});
