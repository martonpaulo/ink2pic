import {einkScore, rankForEink} from '../src/search/rank';
import type {SearchResult, SourceName} from '../src/sources/types';

const r = (
  source: SourceName,
  title: string,
  mime?: string,
  canonical?: boolean,
): SearchResult => ({
  id: `${source}:${title}`,
  source,
  title,
  thumbUrl: 'https://example.test/t',
  license: 'CC0 1.0',
  attribution: 'x',
  mime,
  ...(canonical ? {canonical} : {}),
});

describe('einkScore', () => {
  it('prefers line work and clip art over photos', () => {
    expect(einkScore(r('commons', 'Soup engraving', 'image/jpeg'))).toBe(1);
    expect(einkScore(r('commons', 'Photo of soup', 'image/jpeg'))).toBe(-1);
    expect(einkScore(r('openclipart', 'Soup bowl', 'image/png'))).toBe(1);
    expect(einkScore(r('commons', 'Soup bowl', 'image/png'))).toBe(1);
  });

  it('prefers a picture of the word alone over a scene that mentions it (#43)', () => {
    const plain = einkScore(r('openclipart', 'Cat'), 'cat');
    const named = einkScore(r('openclipart', 'Cat silhouette darkgray'), 'cat');
    const plural = einkScore(r('openclipart', 'Two cats'), 'cat');
    const scene = einkScore(
      r('openclipart', 'Cat fight on a roof at night'),
      'cat',
    );
    const other = einkScore(r('openclipart', 'Dog'), 'cat');
    // A silhouette is line work too: one point more.
    expect(named).toBe(plain + 1);
    expect(plural).toBe(plain);
    expect(plain).toBeGreaterThan(scene);
    expect(scene).toBeGreaterThan(other);
  });

  it('puts logos, maps, diagrams and flags below every plain picture (#43)', () => {
    for (const title of [
      'Apple Logo',
      'Apple origins map',
      'Bicycle diagram',
      'Flag of Apple',
      'Apple structure',
    ]) {
      expect(
        einkScore(r('commons', title, 'image/svg+xml'), 'apple'),
      ).toBeLessThan(
        einkScore(r('commons', 'Pink apple photo', 'image/jpeg'), 'apple'),
      );
    }
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
    // Bowl, Ladle, Kitchen woodcut and Soup tie at 1 and keep their interleaved order (#23).
    expect(titles).toEqual([
      'Bowl',
      'Ladle',
      'Kitchen woodcut',
      'Soup',
      'Photo of a bowl',
    ]);
    expect(rankForEink([clipart, commons]).map(x => x.title)).toEqual(titles);
  });

  it('shows the canonical pictures right after the best drawing (#43)', () => {
    const clipart = [
      r('openclipart', 'Napoleon on a horse with his army'),
      r('openclipart', 'Napoleon'),
    ];
    const wikidata = [
      r('commons', 'Example portrait', 'image/jpeg', true),
      r('commons', 'Example flag', 'image/svg+xml', true),
    ];
    const commons = [r('commons', 'Example portrait', 'image/jpeg')];
    const titles = rankForEink([clipart, commons, wikidata], 'Napoleon').map(
      x => x.title,
    );
    // The duplicate portrait from the Commons search is shown once.
    expect(titles).toEqual([
      'Napoleon',
      'Example portrait',
      'Example flag',
      'Napoleon on a horse with his army',
    ]);
  });

  it('shows the canonical pictures alone when nothing else was found', () => {
    const wikidata = [r('commons', 'Example flag', 'image/svg+xml', true)];
    expect(rankForEink([[], wikidata], 'x').map(x => x.title)).toEqual([
      'Example flag',
    ]);
  });

  it('handles empty lists', () => {
    expect(rankForEink([])).toEqual([]);
    expect(rankForEink([[], []])).toEqual([]);
  });

  it('mixes Commons into the first page when Openclipart has many hits (#23)', () => {
    const clipart = Array.from({length: 8}, (_, i) =>
      r('openclipart', `Bowl ${i}`, 'image/png'),
    );
    const commons = Array.from({length: 3}, (_, i) =>
      r('commons', `Bowl ${i}`, 'image/png'),
    );
    const firstPage = rankForEink([clipart, commons]).slice(0, 6);
    expect(firstPage.filter(x => x.source === 'commons')).toHaveLength(3);
  });
});
