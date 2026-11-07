/**
 * The TypeScript side of the rules both languages hold (#100), against native/tests/twins.json,
 * which native/tests/com/ink2pic/files/TwinsTest.java reads too; dry-check.json's `twins` names
 * each rule's owner. The Measures contract is written four times (the Java module's map, the
 * `ThumbMeasures` fields, the `Measures` type, the simulator's fake): every copy is checked here
 * or in TwinsTest, so a field added on one side only fails.
 */
import fs from 'node:fs';
import path from 'node:path';
import {NativeModules} from 'react-native';
import * as sdk from 'sn-plugin-lib';
import {MEASURE_WIDTH} from '../src/flow/measure';
import {CLEAN_BORDER, Measures} from '../src/search-core/measures';
import {createHost, SHARED_ROOT} from './host/pluginHost';

const ROOT = path.join(__dirname, '..');
const golden = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'native/tests/twins.json'), 'utf8'),
) as {cleanBorder: number; measureWidth: number; measures: string[]};

/** Every key of `Measures`: the type check fails when the type gains or loses one. */
const TS_FIELDS: Record<keyof Measures, true> = {
  width: true,
  height: true,
  mean: true,
  dark: true,
  white: true,
  mid: true,
  border: true,
  borderMedian: true,
  ink: true,
  inkLeft: true,
  inkTop: true,
  inkWidth: true,
  inkHeight: true,
  bands: true,
  lineAspect: true,
  thickness: true,
  edge: true,
  edgeBox: true,
  colours: true,
  objectShare: true,
  hash: true,
  fragments: true,
  darkest: true,
  faintLines: true,
  ms: true,
};
/** Absent from an older module and from the simulator, which hashes nothing. */
const OPTIONAL = ['hash'];

const sorted = (keys: Iterable<string>) => [...keys].sort();

/** The keys `Ink2PicImageModule.measureThumb` puts in the map it answers. */
function moduleKeys(): string[] {
  const java = fs.readFileSync(
    path.join(ROOT, 'native/src/com/ink2pic/files/Ink2PicImageModule.java'),
    'utf8',
  );
  const start = java.indexOf('public void measureThumb(');
  const end = java.indexOf('@ReactMethod', start);
  const body = java.slice(start, end < 0 ? undefined : end);
  return [...body.matchAll(/\.put\w+\("(\w+)"/g)].map(match => match[1]);
}

describe('the rules the Java and the TypeScript share (#100)', () => {
  it('reads the same clean border and measure width', () => {
    expect(CLEAN_BORDER).toBe(golden.cleanBorder);
    expect(MEASURE_WIDTH).toBe(golden.measureWidth);
  });

  it('has one Measures field list on every side', async () => {
    expect(sorted(Object.keys(TS_FIELDS))).toEqual(sorted(golden.measures));
    expect(moduleKeys().length).toBeGreaterThan(0);
    expect(sorted(moduleKeys())).toEqual(sorted(golden.measures));

    const host = createHost().install(
      sdk as unknown as Record<string, Record<string, unknown>>,
      NativeModules,
    );
    host.grantDeclared();
    const files = NativeModules.Ink2PicFiles;
    const file = `${SHARED_ROOT}/a.png`;
    await files.downloadToFile('https://example.org/a.png', file, {});
    const fake = await NativeModules.Ink2PicImage.measureThumb(file);
    expect(sorted(Object.keys(fake))).toEqual(
      sorted(golden.measures.filter(key => !OPTIONAL.includes(key))),
    );
  });
});
