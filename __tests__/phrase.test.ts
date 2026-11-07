/** The written line's search words (#87): question words cut, then one titles check. */
import {readFileSync} from 'fs';
import {join} from 'path';
import {USER_AGENT} from '../src/config';
import {searchWikidata} from '../src/search-core/adapters/wikidata';
import {createContext, FetchLike} from '../src/search-core/fetcher';
import {
  forgetKnownHit,
  knownHit,
  parseTitles,
  resolvePhrase,
  titlesUrl,
} from '../src/search-core/phrase';
import {stripQuestion, trailingGroups} from '../src/search-core/query';

const fixture = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const ok = (text: string) => ({
  ok: true,
  status: 200,
  text: () => Promise.resolve(text),
});
const ctx = (fetch: FetchLike, languages: readonly string[]) =>
  createContext({fetch, userAgent: USER_AGENT, languages});
const TITLES = fixture('wikipedia-titles.json');
const ALL = ['pt', 'en', 'es', 'zh'];

/** Titles that resolve, as the titles check answers for them. */
function titlesAnswer(found: Record<string, string>): string {
  return JSON.stringify({
    batchcomplete: true,
    query: {
      pages: Object.entries(found).map(([title, item]) => ({
        title,
        pageprops: {wikibase_item: item},
      })),
    },
  });
}

afterEach(() => forgetKnownHit());

describe('the question words of each language (#87)', () => {
  it.each([
    ['Quem foi Miguel de Cervantes', ['pt'], 'Miguel de Cervantes'],
    ['o que é a fotossíntese?', ['pt'], 'a fotossíntese'],
    ['Who was Ada Lovelace?', ['en'], 'Ada Lovelace'],
    ['what is a volcano', ['en'], 'a volcano'],
    ['¿Quién fue Simón Bolívar?', ['es'], 'Simón Bolívar'],
    ['Qué es la luna', ['es'], 'la luna'],
    ['谁是孔子', ['zh'], '孔子'],
  ])('«%s» in %j asks for «%s»', (line, languages, asked) => {
    expect(stripQuestion(line, languages)).toBe(asked);
  });

  it('keeps a line in a language the person does not use, and a word that only starts alike', () => {
    expect(stripQuestion('Quem foi Miguel de Cervantes', ['en'])).toBe(
      'Quem foi Miguel de Cervantes',
    );
    expect(stripQuestion('whose dog', ['en'])).toBe('whose dog');
    expect(stripQuestion('Eu comi uma banana', ALL)).toBe('Eu comi uma banana');
  });
});

describe('the trailing word groups (#87)', () => {
  it('lists the groups that may be names, longest first, then the last word', () => {
    expect(trailingGroups('Miguel de Cervantes')).toEqual([
      'Miguel de Cervantes',
      'Cervantes',
    ]);
    expect(trailingGroups('Eu comi uma banana')).toEqual([
      'Eu comi uma banana',
      'banana',
    ]);
    expect(trailingGroups('ontem eu viajei até a China')).toEqual(['China']);
    expect(trailingGroups('I met Ada Lovelace')).toEqual([
      'I met Ada Lovelace',
      'Ada Lovelace',
      'Lovelace',
    ]);
    expect(trailingGroups('')).toEqual([]);
  });

  it('asks every group in one titles request, redirects followed', () => {
    const url = titlesUrl(['Miguel de Cervantes', 'Cervantes'], 'pt');
    expect(url).toMatch(/^https:\/\/pt\.wikipedia\.org\/w\/api\.php\?/);
    expect(url).toContain(
      `titles=${encodeURIComponent('Miguel de Cervantes|Cervantes')}&`,
    );
    expect(url).toContain('redirects=1');
  });

  it('takes the first group that is an article with an item', () => {
    expect(
      parseTitles(TITLES, ['Foi Miguel de Cervantes', 'Miguel de Cervantes', 'Cervantes']),
    ).toEqual({
      group: 'Miguel de Cervantes',
      hit: {
        title: 'Miguel de Cervantes',
        item: 'Q100',
        leadImage: 'Example_portrait.jpg',
        disambiguation: false,
      },
    });
    expect(parseTitles(TITLES, ['Cervantes'])).toMatchObject({group: 'Cervantes'});
    expect(parseTitles(TITLES, ['Quixote'])).toBeNull();
  });
});

describe('resolving a written line (#87)', () => {
  it.each([
    ['Quem foi Miguel de Cervantes', {'Miguel de Cervantes': 'Q5682'}, 'Miguel de Cervantes', 3],
    ['Who was Ada Lovelace', {'Ada Lovelace': 'Q7259'}, 'Ada Lovelace', 2],
    ['Quién fue Simón Bolívar', {'Simón Bolívar': 'Q8605'}, 'Simón Bolívar', 2],
    ['Eu comi uma banana', {Banana: 'Q503'}, 'banana', 1],
  ])('«%s» searches the words that won', async (line, found, query, words) => {
    const fetch = jest.fn().mockResolvedValue(ok(titlesAnswer(found)));
    const chosen = await resolvePhrase(line, ctx(fetch, ALL));
    expect(chosen).toMatchObject({query, words});
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('searches the last word with no request when no group can be a name', async () => {
    const fetch = jest.fn();
    const chosen = await resolvePhrase('ontem eu viajei até a China', ctx(fetch, ALL));
    expect(chosen).toMatchObject({query: 'China', words: 1});
    expect(fetch).not.toHaveBeenCalled();
  });

  it('falls back to the last word when the check fails or finds nothing', async () => {
    const failing = jest.fn().mockResolvedValue({ok: false, status: 500, text: async () => ''});
    expect(await resolvePhrase('Quem foi Miguel de Cervantes', ctx(failing, ALL))).toMatchObject({
      query: 'Cervantes',
      words: 1,
    });
    const none = jest.fn().mockResolvedValue(ok(titlesAnswer({})));
    expect(await resolvePhrase('Quem foi Miguel de Cervantes', ctx(none, ALL))).toMatchObject({
      query: 'Cervantes',
    });
    expect(knownHit('Cervantes', 'pt')).toBeNull();
  });

  it('replaces the lookup request: the Wikidata search of the winner asks Wikipedia nothing', async () => {
    const check = jest.fn().mockResolvedValue(ok(TITLES));
    await resolvePhrase('Quem foi Miguel de Cervantes', ctx(check, ['pt', 'en']));
    expect(knownHit('miguel de cervantes', 'pt')).toMatchObject({item: 'Q100'});
    const search = jest
      .fn()
      .mockResolvedValueOnce(ok(fixture('wikidata-missing.json')))
      .mockResolvedValue(ok(fixture('commons-files.json')));
    await searchWikidata('Miguel de Cervantes', ctx(search, ['pt', 'en']));
    const urls = search.mock.calls.map(call => call[0] as string);
    expect(urls.filter(url => url.includes('wikipedia.org'))).toEqual([]);
    expect(urls[0]).toContain('wbgetentities');
  });
});
