/**
 * The search lab shows the order the device shows (#100): the lab's pixel step (`orderEntries`
 * in lab/pixelorder.mjs) and the flow's `measureFirstPages` give the same order on the same
 * measures. The lab runs in Node on its own, outside Jest, so it is asked through a child process.
 */
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {measureFirstPages, MeasureDeps} from '../src/flow/measure';
import {startLog} from '../src/log/memory';
import {ok} from '../src/sdk/result';
import type {Measures} from '../src/search-core/measures';
import type {SearchResult} from '../src/search-core/types';

const ROOT = path.join(__dirname, '..');
/** The lab's start-up transpiles the search core; a loaded runner needs more than Jest's 5 s. */
const LAB_TIMEOUT_MS = 60000;

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
const photo: Measures = {
  ...paper,
  mean: 104,
  dark: 0.38,
  white: 0,
  mid: 0.62,
  border: 0,
  borderMedian: 110,
  ink: 0.3,
  thickness: 9,
  edge: 0.12,
  edgeBox: 0.95,
  colours: 900,
  objectShare: 0.6,
};

/** Each result's thumbnail, contour drawing and darkened copy, as LabPixels measures them. */
type Entry = {measures: Measures; contour: Measures; darkened: Measures};
const HASH = 'ab'.repeat(24);
const entries: Record<string, Entry> = {
  // A clean drawing, and a near-duplicate of it with fewer edges.
  line: {measures: outline, contour: outline, darkened: outline},
  copy: {
    measures: {...outline, hash: HASH, edge: 0.2},
    contour: outline,
    darkened: outline,
  },
  twin: {
    measures: {...outline, hash: HASH, edge: 0.25},
    contour: outline,
    darkened: outline,
  },
  // A photo with a clean contour, and one whose contour is mostly speckle (#83).
  photo: {
    measures: photo,
    contour: {...outline, colours: 16, mean: 240},
    darkened: photo,
  },
  speckled: {
    measures: {...photo, mean: 110},
    contour: {...outline, fragments: 0.6},
    darkened: photo,
  },
  // Faint line work, darkened (#81).
  faint: {
    measures: {...outline, faintLines: true, mean: 251, white: 0.94, ink: 0},
    darkened: {...outline, mean: 230},
    contour: outline,
  },
  heavy: {
    measures: {...outline, thickness: 7, edge: 0.3, white: 0.7},
    contour: outline,
    darkened: outline,
  },
};
const ids = ['speckled', 'twin', 'line', 'photo', 'faint', 'copy', 'heavy'];
/** Titles the ranker reads: «Photos too» stops ranking a photo's title down (#92). */
const TITLES: Record<string, string> = {line: 'photograph'};
const result = (id: string, canonical = false): SearchResult => ({
  id,
  source: 'openclipart',
  title: TITLES[id] ?? id,
  thumbUrl: `https://example.test/${id}`,
  license: 'CC0 1.0',
  attribution: 'x',
  ...(canonical ? {canonical} : {}),
});
const results = [...ids.map(id => result(id)), result('later')];

type Style = {allContour: boolean; photos: boolean};

/** The lab's order, from its own module in Node. */
function labOrder(query: string, style: Style): string[] {
  const script = `
    import {product} from './lab/lib.mjs';
    import {orderEntries} from './lab/pixelorder.mjs';
    let text = '';
    for await (const chunk of process.stdin) text += chunk;
    const {results, entries, query, style} = JSON.parse(text);
    const byId = new Map(
      Object.entries(entries).map(([id, entry]) => [id, {entry, file: id}]),
    );
    const order = orderEntries(results, byId, query, product().core, style);
    process.stdout.write(JSON.stringify(order.results.map(r => r.id)));
  `;
  const out = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    {
      cwd: ROOT,
      input: JSON.stringify({results, entries, query, style}),
      encoding: 'utf8',
    },
  );
  return JSON.parse(out);
}

/** The device's order, through the flow with an analyzer that answers the same measures. */
async function deviceOrder(query: string, style: Style): Promise<string[]> {
  const byPath = new Map<string, Measures>();
  for (const [id, entry] of Object.entries(entries)) {
    byPath.set(`/t/thumbs/${id}`, entry.measures);
    byPath.set(`/t/thumbs/${id}.contour.png`, entry.contour);
    byPath.set(`/t/thumbs/${id}.dark.png`, entry.darkened);
  }
  const converted = ok({width: 400, height: 400, ms: 1});
  const deps: MeasureDeps = {
    analyzer: {
      measure: async file => {
        const measures = byPath.get(file);
        if (!measures) {
          throw new Error(`no measures for ${file}`);
        }
        return ok(measures);
      },
      toContour: async () => converted,
      darken: async () => converted,
    },
    thumb: async item => `file:///t/thumbs/${item.id}`,
    limitMs: 1000,
    allContour: async () => style.allContour,
    photos: async () => style.photos,
  };
  const measured = await measureFirstPages(results, '/t', query, deps);
  return measured.results.map(item => item.id);
}

describe('the lab order is the device order (#100)', () => {
  beforeEach(() => startLog());

  it.each([
    ['cat', {allContour: false, photos: false}],
    ['cat drawing', {allContour: false, photos: false}],
    ['cat photo', {allContour: false, photos: false}],
    ['cat', {allContour: false, photos: true}],
    ['cat', {allContour: true, photos: false}],
  ])(
    'gives the same order for "%s" with %j',
    async (query, style) => {
      const device = await deviceOrder(query, style);
      expect(labOrder(query, style)).toEqual(device);
      // The measures move results, so the test compares real orders.
      expect(device).not.toEqual(results.map(item => item.id));
    },
    LAB_TIMEOUT_MS,
  );
});
