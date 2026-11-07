import INDEX from '../src/search-core/data/openmoji-index.json';
import {
  matchSymbols,
  searchOpenmoji,
} from '../src/search-core/adapters/openmoji';
import {createContext} from '../src/search-core/fetcher';
import {rankForEink} from '../src/search-core/rank';
import {
  DEFAULT_ADAPTERS,
  insertUrl,
  isSourceName,
} from '../src/search-core/registry';
import type {SearchResult} from '../src/search-core/types';

const fetch = jest.fn(async () => {
  throw new Error('OpenMoji matched a word over the network');
});
const ctx = (languages: string[]) =>
  createContext({fetch, userAgent: 'test', languages});

async function symbols(query: string, languages = ['en']) {
  const outcome = await searchOpenmoji(query, ctx(languages));
  if (!outcome.ok) {
    throw new Error(outcome.message);
  }
  return outcome.results;
}

const hexes = (results: SearchResult[]) =>
  results.map(result => result.id.replace('openmoji:', ''));

const COLD_FACE = '1F976';
const SNOWFLAKE = '2744';
const LIGHT_BULB = '1F4A1';
const RED_APPLE = '1F34E';

const drawing = (title: string, n: number): SearchResult => ({
  id: `openclipart:${n}`,
  source: 'openclipart',
  title,
  thumbUrl: `https://openclipart.org/image/400px/${n}`,
  license: 'CC0 1.0',
  attribution: 'Openclipart',
  mime: 'image/png',
});

afterEach(() => expect(fetch).not.toHaveBeenCalled());

describe('the OpenMoji symbols (#67)', () => {
  it('leads «cold» with the cold face or the snowflake', async () => {
    const results = await symbols('cold');
    expect([COLD_FACE, SNOWFLAKE]).toContain(hexes(results)[0]);
    expect(results[0].leads).toBe(true);
    expect(hexes(results)).toContain(SNOWFLAKE);
  });

  it('leads «idea» with the light bulb', async () => {
    const results = await symbols('idea');
    expect(hexes(results)[0]).toBe(LIGHT_BULB);
    expect(results[0].leads).toBe(true);
  });

  it('leads «happy» with a smiling face', async () => {
    const results = await symbols('happy');
    expect(results[0].leads).toBe(true);
    expect(results[0].title).toMatch(/face/);
  });

  it('offers the apple but never lets it lead «apple»', async () => {
    const results = await symbols('apple');
    expect(hexes(results)).toContain(RED_APPLE);
    expect(results.some(result => result.leads)).toBe(false);
  });

  it('understands Portuguese, Spanish and Chinese, accents folded', async () => {
    expect(hexes(await symbols('frio', ['pt']))).toContain(COLD_FACE);
    expect(hexes(await symbols('frio', ['es']))).toContain(COLD_FACE);
    expect(hexes(await symbols('Frío', ['es']))).toContain(COLD_FACE);
    expect(hexes(await symbols('冷', ['en', 'zh']))).toContain(COLD_FACE);
  });

  it('reads only the languages the context lists', async () => {
    expect(await symbols('冷', ['en'])).toEqual([]);
    expect(await symbols('frio', ['en'])).toEqual([]);
  });

  it('records the credit, the licence and the picture of each symbol', async () => {
    const [face] = await symbols('cold');
    expect(face).toMatchObject({
      source: 'openmoji',
      license: 'CC BY-SA 4.0',
      attribution: 'OpenMoji',
      mime: 'image/png',
    });
    // The pinned 17.0.0 release, as the keywords (#99): never `master`.
    const url = `https://raw.githubusercontent.com/hfg-gmuend/openmoji/f9fc506a3f913be9897ab0181d611d4c910a4104/black/618x618/${hexes(
      [face],
    )}.png`;
    expect(face.thumbUrl).toBe(url);
    expect(insertUrl(face)).toBe(url);
  });

  it('ships no brand logo, flag or skin-tone variant', () => {
    const shipped = INDEX.entries.map(line => line.split(' ')[0]);
    expect(shipped).not.toContain('F8FF');
    expect(shipped).not.toContain('E051');
    expect(shipped.some(hex => /^1F1E[6-9A-F]|^1F1F/.test(hex))).toBe(false);
    expect(shipped.some(hex => /1F3F[B-F]/.test(hex))).toBe(false);
    const apple = matchSymbols('apple', ['en']).map(match => match.symbol.hex);
    expect(apple).not.toContain('F8FF');
  });

  it('is one of the default sources, switched off by its name (#70)', () => {
    expect(DEFAULT_ADAPTERS.map(source => source.name)).toContain('openmoji');
    expect(isSourceName('openmoji')).toBe(true);
  });
});

describe('symbols in the ranking (#67)', () => {
  it('puts a leading symbol of «cold» first', async () => {
    const lists = [
      [drawing('Cold', 1), drawing('cold weather', 2)],
      await symbols('cold'),
    ];
    expect(rankForEink(lists, 'cold')[0].source).toBe('openmoji');
  });

  it('puts a drawing of an apple before the apple symbol', async () => {
    const lists = [
      [drawing('Apple', 1), drawing('red apple', 2)],
      await symbols('apple'),
    ];
    const ranked = rankForEink(lists, 'apple');
    expect(ranked[0].source).toBe('openclipart');
    expect(ranked.map(result => result.source)).toContain('openmoji');
  });
});
