import {readFileSync} from 'fs';
import {join} from 'path';
import {USER_AGENT} from '../src/config';
import {
  entityUrl,
  isQueryArticle,
  claimsUrl,
  logoCandidatesUrl,
  logoCategorySearch,
  notablePersonUrl,
  parseNotablePerson,
  parseEntityResponse,
  parseLogoItem,
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

  it('leads with the logo of an organisation or a brand, with no list of classes', () => {
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

  it('leads with a brand logo whose class no list names: Coca-Cola is a drink brand (#92)', () => {
    const brand = entity({
      P31: [claim('P31', {id: 'Q114392939'}), claim('P31', {id: 'Q167270'})],
      P279: [claim('P279', {id: 'Q134041'})],
      P154: [claim('P154', 'Example cola logo.svg')],
      P18: [claim('P18', 'Example cola bottle.jpg')],
    });
    expect(parseEntityResponse(brand)).toMatchObject({
      leadingLogo: 'Example cola logo.svg',
    });
  });

  it('never leads with the logo of a place or a person', () => {
    // A place is known by its coordinates (P625), with no list of place classes (#92).
    const city = entity({
      P31: [claim('P31', {id: 'Q515'})],
      P625: [claim('P625', {latitude: 1, longitude: 2})],
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
    const noItem = JSON.stringify({search: []});
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

  it('finds the brand a logo query names through Wikidata: «apple logo» is Apple Inc., not the fruit', async () => {
    const page = JSON.stringify({
      batchcomplete: true,
      query: {pages: [{title: 'Logo (programming language)', index: 1}]},
    });
    const candidates = JSON.stringify({
      search: [{id: 'Q89'}, {id: 'Q312'}, {id: 'Q213710'}],
    });
    const statement = (value: string) => [
      {rank: 'normal', mainsnak: {snaktype: 'value', datavalue: {value}}},
    ];
    const instance = (id: string) => [
      {rank: 'normal', mainsnak: {snaktype: 'value', datavalue: {value: {id}}}},
    ];
    const claims = JSON.stringify({
      entities: {
        // The fruit has no logo; Apple Corps is later in Wikidata's order.
        Q89: {claims: {P18: statement('Red Apple.jpg')}},
        Q312: {
          claims: {
            P31: instance('Q891723'),
            P154: statement('Apple logo black.svg'),
          },
        },
        Q213710: {
          claims: {
            P31: instance('Q783794'),
            P154: statement('Apple Corps.svg'),
          },
        },
      },
    });
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(ok(page))
      .mockResolvedValueOnce(ok(candidates))
      .mockResolvedValueOnce(ok(claims))
      .mockResolvedValue(ok(JSON.stringify({entities: {}})));
    await searchWikidata('apple logo', ctx(fetch));
    expect(fetch.mock.calls[1][0]).toBe(logoCandidatesUrl('apple', 'en'));
    expect(fetch.mock.calls[2][0]).toBe(claimsUrl(['Q89', 'Q312', 'Q213710']));
    expect(fetch.mock.calls[3][0]).toBe(entityUrl('Q312'));
    expect(parseLogoItem(claims, ['Q89', 'Q312', 'Q213710'], 'apple')).toEqual({
      ok: true,
      hit: {title: 'apple', item: 'Q312', disambiguation: false},
    });
  });

  it('leads an organisation with no logo with its Commons logos category (#92)', async () => {
    const page = JSON.stringify({
      batchcomplete: true,
      query: {
        pages: [
          {
            title: 'Example Institute',
            index: 1,
            pageprops: {wikibase_item: 'Q834650'},
          },
        ],
      },
    });
    const institute = entity({
      P31: [claim('P31', {id: 'Q163740'})],
      P159: [claim('P159', {id: 'Q30138'})],
      P373: [claim('P373', 'Example Institute')],
      P18: [claim('P18', 'Example facade.jpg')],
    });
    expect(parseEntityResponse(institute)).toMatchObject({
      logoCategory: 'Example Institute',
    });
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(ok(page))
      .mockResolvedValueOnce(ok(institute))
      .mockResolvedValue(ok(FILES));
    const outcome = await searchWikidata('Example Institute', ctx(fetch));
    const urls = fetch.mock.calls.map(call => decodeURIComponent(call[0]));
    expect(urls).toContainEqual(
      expect.stringContaining(logoCategorySearch('Example Institute')),
    );
    expect(outcome.ok && outcome.results[0]).toMatchObject({
      canonical: true,
      leads: true,
    });
  });
});

describe('the notable namesake (#92)', () => {
  const instance = (id: string) => [
    {rank: 'normal', mainsnak: {snaktype: 'value', datavalue: {value: {id}}}},
  ];
  it('takes the most notable person a name article names: «Napoleão» is Napoleon', async () => {
    const page = JSON.stringify({
      batchcomplete: true,
      query: {
        pages: [
          {
            title: 'Napoleão',
            index: 1,
            pageprops: {wikibase_item: 'Q109674583'},
          },
        ],
      },
    });
    const surname = JSON.stringify({
      entities: {Q109674583: {claims: {P31: instance('Q101352')}}},
    });
    const person = JSON.stringify({
      batchcomplete: true,
      query: {search: [{ns: 0, title: 'Q517'}]},
    });
    const napoleon = JSON.stringify({
      entities: {Q517: {claims: {P31: instance('Q5')}}},
    });
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(ok(page))
      .mockResolvedValueOnce(ok(surname))
      .mockResolvedValueOnce(ok(person))
      .mockResolvedValueOnce(ok(napoleon))
      .mockResolvedValue(ok(NONE));
    expect((await searchWikidata('Napoleão', ctx(fetch))).ok).toBe(true);
    expect(fetch.mock.calls[2][0]).toBe(notablePersonUrl('Napoleão'));
    expect(fetch.mock.calls[3][0]).toBe(entityUrl('Q517'));
    // The people gallery is Napoleon's, not the family name's.
    expect(decodeURIComponent(fetch.mock.calls[4][0])).toContain(
      'haswbstatement:P180=Q517',
    );
    expect(parseNotablePerson(person)).toBe('Q517');
    expect(
      parseNotablePerson(JSON.stringify({query: {search: []}})),
    ).toBeNull();
  });

  it('asks for a person, the most linked first', () => {
    const url = decodeURIComponent(notablePersonUrl(' Napoleão '));
    expect(url).toContain('srsearch=Napoleão haswbstatement:P31=Q5&');
    expect(url).toContain('srsort=incoming_links_desc');
    expect(url).toContain('srlimit=1');
  });
});
