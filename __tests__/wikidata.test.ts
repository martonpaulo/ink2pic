import {readFileSync} from 'fs';
import {join} from 'path';
import {USER_AGENT} from '../src/config';
import {
  entityUrl,
  isQueryArticle,
  logoItemUrl,
  parseEntityResponse,
  parseLogoItemResponse,
  parseWikipediaResponse,
  searchWikidata,
  wikidataAdapter,
  wikipediaUrl,
} from '../src/search-core/adapters/wikidata';
import {createContext, FetchLike} from '../src/search-core/fetcher';
import {lookupLanguages, normalise} from '../src/search-core/query';

const ctx = (fetch: FetchLike, languages: readonly string[] = ['en']) =>
  createContext({fetch, userAgent: USER_AGENT, languages});

const fixture = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const ok = (text: string) => ({
  ok: true,
  status: 200,
  text: () => Promise.resolve(text),
});
const FILES = fixture('commons-files.json');
const NONE = fixture('commons-none.json');

describe('the Wikipedia lookup (#71)', () => {
  it('asks one Wikipedia for the article, its item, its lead image and a suggestion', () => {
    const url = wikipediaUrl('  Frederico   García Lorca ', 'en');
    expect(url).toMatch(/^https:\/\/en\.wikipedia\.org\/w\/api\.php\?/);
    const q = encodeURIComponent('Frederico García Lorca');
    expect(url).toContain(`srsearch=${q}&`);
    expect(url).toContain(`gsrsearch=${q}&`);
    expect(url).toContain('srinfo=suggestion');
    expect(url).toContain('gsrlimit=1');
    expect(url).toContain(`prop=${encodeURIComponent('pageprops|pageimages')}`);
    expect(url).toContain(
      `ppprop=${encodeURIComponent('wikibase_item|disambiguation')}`,
    );
    expect(url).toContain('piprop=name');
  });

  it('keeps the typed case: a lowered title missed every multi-word name', () => {
    expect(normalise(' GARCIA  LORCA! ')).toBe('GARCIA LORCA');
    expect(wikipediaUrl('SOUP', 'en')).toContain('srsearch=SOUP&');
  });

  it('reads the article, its item and its lead image', () => {
    expect(parseWikipediaResponse(fixture('wikipedia-hit.json'))).toEqual({
      ok: true,
      hit: {
        title: 'Federico García Lorca',
        item: 'Q100',
        leadImage: 'Example_portrait.jpg',
        disambiguation: false,
      },
      suggestion: 'frederico garcia llorca',
    });
    expect(parseWikipediaResponse(fixture('wikipedia-none.json'))).toEqual({
      ok: true,
      hit: null,
      suggestion: 'elephant',
    });
    expect(parseWikipediaResponse('<html>').ok).toBe(false);
    expect(
      parseWikipediaResponse('{"error":{"code":"ratelimited","info":"x"}}'),
    ).toEqual({ok: false, kind: 'throttled', message: 'ratelimited: x'});
  });

  it('reads the claims by the item id', () => {
    expect(entityUrl('Q41408')).toBe(
      'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=Q41408&props=claims',
    );
  });
});

describe('the query languages (#71, owner D7)', () => {
  it('sends a Han query to Chinese first, and skips Chinese for any other script', () => {
    expect(lookupLanguages('鲁迅', ['es', 'en', 'zh'])).toEqual([
      'zh',
      'es',
      'en',
    ]);
    expect(lookupLanguages('perro', ['zh', 'es', 'en', 'pt'])).toEqual([
      'es',
      'en',
      'pt',
    ]);
    expect(lookupLanguages('鲁迅', ['en'])).toEqual(['en']);
  });

  it('tries the languages in order until one has the article', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(ok(fixture('wikipedia-none.json')))
      .mockResolvedValueOnce(ok(fixture('wikipedia-hit.json')))
      .mockResolvedValueOnce(ok(fixture('wikidata-missing.json')))
      .mockResolvedValue(ok(FILES));
    await searchWikidata('sopa', ctx(fetch, ['es', 'pt']));
    expect(fetch.mock.calls[0][0]).toMatch(/^https:\/\/es\.wikipedia\.org/);
    expect(fetch.mock.calls[1][0]).toMatch(/^https:\/\/pt\.wikipedia\.org/);
  });

  it('gives every language its own request budget', () => {
    const requests = wikidataAdapter.requests as (c: unknown) => number;
    expect(requests(ctx(jest.fn(), ['zh', 'es', 'en', 'pt']))).toBe(6);
  });
});

describe('parseEntityResponse', () => {
  it('takes flag, logo and image in that order, preferred first, never deprecated', () => {
    expect(parseEntityResponse(fixture('wikidata-entity.json'))).toEqual({
      ok: true,
      files: ['Example flag.svg', 'Example portrait.jpg'],
      human: true,
      signature: 'Example signature.svg',
      flag: 'Example flag.svg',
    });
  });

  it('reads an id with no item as a real empty answer', () => {
    expect(parseEntityResponse(fixture('wikidata-missing.json'))).toEqual({
      ok: true,
      files: [],
      human: false,
    });
  });

  it('maps errors and odd bodies to failures', () => {
    expect(
      parseEntityResponse('{"error":{"code":"maxlag","info":"lag"}}'),
    ).toEqual({ok: false, kind: 'throttled', message: 'maxlag: lag'});
    expect(parseEntityResponse('null').ok).toBe(false);
    expect(parseEntityResponse('{}').ok).toBe(false);
    expect(parseEntityResponse('<html>').ok).toBe(false);
  });
});

describe('searchWikidata', () => {
  it('finds a misspelled person through Wikipedia, with the portrait and the depicts gallery', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(ok(fixture('wikipedia-hit.json')))
      .mockResolvedValueOnce(ok(fixture('wikidata-entity.json')))
      .mockImplementation(async (url: string) =>
        ok(
          url.includes('haswbstatement') ? fixture('commons-soup.json') : FILES,
        ),
      );
    const outcome = await searchWikidata('Frederico García Lorca', ctx(fetch));
    const urls = fetch.mock.calls.map(call => call[0] as string);
    expect(urls).toHaveLength(4);
    expect(urls[1]).toContain('ids=Q100');
    const files = urls.find(url => url.includes('titles='))!;
    // Claims first, then the lead image (already there as P18), never the signature (P109).
    expect(files).toContain(
      encodeURIComponent('File:Example flag.svg|File:Example portrait.jpg'),
    );
    expect(files).not.toContain('signature');
    expect(urls.find(url => url.includes('haswbstatement'))).toContain(
      encodeURIComponent('haswbstatement:P180=Q100 filetype:bitmap'),
    );
    expect(fetch.mock.calls[0][1].headers['Api-User-Agent']).toMatch(
      /^Ink2Pic\//,
    );
    if (!outcome.ok) {
      throw new Error(outcome.message);
    }
    const canonical = outcome.results.filter(r => r.canonical);
    expect(canonical.map(r => r.title)).toEqual([
      'Example flag',
      'Example portrait',
    ]);
    // The item's own flag (P41) leads the page (#89); its other pictures do not.
    expect(canonical.map(r => r.leads === true)).toEqual([true, false]);
    expect(outcome.results.length).toBeGreaterThan(canonical.length);
  });

  it('makes one request for a word with no article, and passes the suggestion on', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue(ok(fixture('wikipedia-none.json')));
    expect(await searchWikidata('elefant', ctx(fetch))).toEqual({
      ok: true,
      results: [],
      suggestion: 'elephant',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('shows nothing for a disambiguation page', async () => {
    const page = JSON.stringify({
      batchcomplete: true,
      query: {
        pages: [
          {
            title: 'Mercury',
            index: 1,
            pageprops: {wikibase_item: 'Q1', disambiguation: ''},
          },
        ],
      },
    });
    const fetch = jest.fn().mockResolvedValue(ok(page));
    expect(await searchWikidata('mercury', ctx(fetch))).toEqual({
      ok: true,
      results: [],
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('shows the lead image alone for an article with no item', async () => {
    const page = JSON.stringify({
      batchcomplete: true,
      query: {
        pages: [{title: 'Soup', index: 1, pageimage: 'Example_flag.svg'}],
      },
    });
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(ok(page))
      .mockResolvedValueOnce(ok(FILES));
    const outcome = await searchWikidata('soup', ctx(fetch));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toContain(
      encodeURIComponent('File:Example flag.svg'),
    );
    // The fixture answers every file it holds; the lead image comes first.
    expect(outcome.ok && outcome.results[0].title).toBe('Example flag');
  });

  it('keeps the portrait when the depicts gallery fails', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(ok(fixture('wikipedia-hit.json')))
      .mockResolvedValueOnce(ok(fixture('wikidata-entity.json')))
      .mockImplementation(async (url: string) =>
        url.includes('haswbstatement')
          ? {ok: false, status: 404, text: jest.fn()}
          : ok(FILES),
      );
    const outcome = await searchWikidata('lorca', ctx(fetch));
    expect(outcome.ok && outcome.results.every(r => r.canonical)).toBe(true);
  });

  it('reports a refused host as a failure, not as no pictures', async () => {
    jest.useFakeTimers();
    const fetch = jest.fn().mockRejectedValue(new Error('fetch failed'));
    const pending = searchWikidata('apple', ctx(fetch));
    await jest.advanceTimersByTimeAsync(400);
    expect(await pending).toEqual({
      ok: false,
      kind: 'network',
      message: 'fetch failed',
    });
    jest.useRealTimers();
  });

  it('needs no Commons request when nothing is found', async () => {
    const fetch = jest.fn().mockResolvedValue(ok(NONE));
    expect((await searchWikidata('qzxv', ctx(fetch))).ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('logos of organisations and brands (#81)', () => {
  const claim = (property: string, value: unknown) => ({
    mainsnak: {snaktype: 'value', property, datavalue: {value}},
    rank: 'normal',
  });
  const entity = (claims: Record<string, unknown[]>) =>
    JSON.stringify({entities: {Q1: {claims}}});

  it('leads with the logo of an organisation, known by its class or its headquarters', () => {
    const company = entity({
      P31: [claim('P31', {id: 'Q4830453'})],
      P154: [claim('P154', 'Example company logo.svg')],
    });
    expect(parseEntityResponse(company)).toMatchObject({
      files: ['Example company logo.svg'],
      leadingLogo: 'Example company logo.svg',
    });
    const institute = entity({
      P31: [claim('P31', {id: 'Q999999'})],
      P159: [claim('P159', {id: 'Q956'})],
      P154: [claim('P154', 'Example institute logo.svg')],
    });
    expect(parseEntityResponse(institute)).toMatchObject({
      leadingLogo: 'Example institute logo.svg',
    });
  });

  it('never leads with the logo of a thing or a person', () => {
    const city = entity({
      P31: [claim('P31', {id: 'Q515'})],
      P154: [claim('P154', 'Example city logo.svg')],
    });
    const outcome = parseEntityResponse(city);
    expect(outcome).toMatchObject({files: ['Example city logo.svg']});
    expect(outcome).not.toHaveProperty('leadingLogo');
    expect(
      parseEntityResponse(fixture('wikidata-entity.json')),
    ).not.toHaveProperty('leadingLogo');
  });

  it('drops an article a style word found alone: «apple logo» is not the Logo language', async () => {
    expect(isQueryArticle('apple logo', 'Logo (programming language)')).toBe(
      false,
    );
    expect(isQueryArticle('apple logo', 'Apple Inc.')).toBe(true);
    // Without a style word the search's spelling tolerance decides.
    expect(isQueryArticle('elephent', 'Elephant')).toBe(true);
    const page = JSON.stringify({
      batchcomplete: true,
      query: {
        pages: [
          {
            title: 'Logo (programming language)',
            index: 1,
            pageprops: {wikibase_item: 'Q201436'},
            pageimage: 'Example_turtle.gif',
          },
        ],
      },
    });
    const noItem = JSON.stringify({batchcomplete: true, query: {search: []}});
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(ok(page))
      .mockResolvedValueOnce(ok(noItem));
    expect(await searchWikidata('apple logo', ctx(fetch))).toEqual({
      ok: true,
      results: [],
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('finds the brand a logo query names through Wikidata: «apple logo» is Apple Inc.', async () => {
    const page = JSON.stringify({
      batchcomplete: true,
      query: {pages: [{title: 'Logo (programming language)', index: 1}]},
    });
    const item = JSON.stringify({
      batchcomplete: true,
      query: {search: [{title: 'Q312'}]},
    });
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(ok(page))
      .mockResolvedValueOnce(ok(item))
      .mockResolvedValue(ok(JSON.stringify({entities: {}})));
    await searchWikidata('apple logo', ctx(fetch));
    expect(fetch.mock.calls[1][0]).toBe(logoItemUrl('apple'));
    expect(decodeURIComponent(fetch.mock.calls[1][0])).toContain(
      'srsearch=apple haswbstatement:P154',
    );
    expect(fetch.mock.calls[2][0]).toBe(entityUrl('Q312'));
    expect(parseLogoItemResponse(item, 'apple')).toEqual({
      ok: true,
      hit: {title: 'apple', item: 'Q312', disambiguation: false},
    });
  });
});
