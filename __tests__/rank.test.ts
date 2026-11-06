import {einkScore, rankForEink} from '../src/search/rank';
import type {SearchResult, SourceName} from '../src/sources/types';

const r = (source: SourceName, title: string, mime?: string): SearchResult => ({
  id: `${source}:${title}`,
  source,
  title,
  thumbUrl: 'https://example.test/t',
  fullUrl: () => 'https://example.test/f',
  license: 'CC0 1.0',
  attribution: 'x',
  mime,
});

describe('einkScore', () => {
  it('prefers line work and clip art over photos', () => {
    expect(einkScore(r('commons', 'Soup engraving', 'image/jpeg'))).toBe(2);
    expect(einkScore(r('commons', 'Photo of soup', 'image/jpeg'))).toBe(-1);
    expect(einkScore(r('openclipart', 'Soup bowl', 'image/png'))).toBe(2);
  });
});

describe('rankForEink', () => {
  it('ranks deterministically and mixes sources on ties', () => {
    const clipart = [
      r('openclipart', 'Bowl', 'image/png'),
      r('openclipart', 'Ladle', 'image/png'),
    ];
    const commons = [
      r('commons', 'Photo of a bowl', 'image/jpeg'),
      r('commons', 'Kitchen woodcut', 'image/jpeg'),
      r('commons', 'Soup', 'image/png'),
    ];
    const titles = rankForEink([clipart, commons]).map(x => x.title);
    expect(titles).toEqual([
      'Bowl',
      'Ladle',
      'Kitchen woodcut',
      'Soup',
      'Photo of a bowl',
    ]);
    expect(rankForEink([clipart, commons]).map(x => x.title)).toEqual(titles);
  });

  it('handles empty lists', () => {
    expect(rankForEink([])).toEqual([]);
    expect(rankForEink([[], []])).toEqual([]);
  });
});
