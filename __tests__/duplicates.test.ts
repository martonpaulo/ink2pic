import {
  dropNearDuplicates,
  DUPLICATE_BITS,
  hashDistance,
} from '../src/search-core/duplicates';
import type {Measures} from '../src/search-core/measures';
import type {SearchResult} from '../src/search-core/types';

const result = (id: string, canonical = false): SearchResult => ({
  id,
  source: 'commons',
  title: id,
  thumbUrl: 'https://example.test/t',
  license: 'CC0 1.0',
  attribution: 'x',
  ...(canonical && {canonical}),
});

const HASH = '0f'.repeat(24);
/** The same hash with its first `digits` hex digits inverted: 4 bits each. */
const flipped = (digits: number) =>
  [...HASH]
    .map((digit, i) => (i < digits ? (15 - parseInt(digit, 16)).toString(16) : digit))
    .join('');

/** Only the fields the duplicate check reads; the rest are not used. */
const measured = (hash: string | undefined, edge = 0.1, mean = 200) =>
  ({width: 330, height: 220, mean, edge, hash} as Measures);

const ids = (results: SearchResult[]) => results.map(x => x.id);

describe('hashDistance', () => {
  it('counts the bits that differ', () => {
    expect(hashDistance(HASH, HASH)).toBe(0);
    expect(hashDistance('0', 'f')).toBe(4);
    expect(hashDistance('a5', '5a')).toBe(8);
    expect(hashDistance('0', '00')).toBe(Infinity);
  });
});

describe('dropNearDuplicates (#89)', () => {
  it('shows two identical pictures once, in the place of the first', () => {
    const results = [result('a'), result('b'), result('c')];
    const measures = new Map([
      ['a', measured(HASH)],
      ['b', measured('3c'.repeat(24))],
      ['c', measured(HASH)],
    ]);
    expect(ids(dropNearDuplicates(results, measures))).toEqual(['a', 'b']);
  });

  it('keeps two different pictures', () => {
    const results = [result('a'), result('b')];
    const far = flipped(DUPLICATE_BITS / 4 + 1);
    expect(hashDistance(HASH, far)).toBeGreaterThan(DUPLICATE_BITS);
    const measures = new Map([
      ['a', measured(HASH)],
      ['b', measured(far)],
    ]);
    expect(ids(dropNearDuplicates(results, measures))).toEqual(['a', 'b']);
  });

  it('keeps the same pattern in another tone or shape', () => {
    const results = [result('a'), result('b'), result('c')];
    const measures = new Map([
      ['a', measured(HASH, 0.1, 200)],
      ['b', measured(HASH, 0.1, 90)],
      ['c', {...measured(HASH), width: 100, height: 300}],
    ]);
    expect(ids(dropNearDuplicates(results, measures))).toEqual(['a', 'b', 'c']);
  });

  it('keeps the cleaner copy, in the place of the first', () => {
    const results = [result('noisy'), result('b'), result('clean')];
    const measures = new Map([
      ['noisy', measured(HASH, 0.2)],
      ['b', measured('3c'.repeat(24))],
      ['clean', measured(flipped(1), 0.05)],
    ]);
    expect(ids(dropNearDuplicates(results, measures))).toEqual(['clean', 'b']);
  });

  it('never drops a canonical picture, and keeps unmeasured results', () => {
    const results = [result('copy'), result('flag', true), result('x')];
    const measures = new Map([
      ['copy', measured(HASH)],
      ['flag', measured(HASH)],
      ['x', measured(undefined)],
    ]);
    expect(ids(dropNearDuplicates(results, measures))).toEqual(['flag', 'x']);
  });
});
