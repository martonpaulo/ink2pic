import {readFileSync} from 'fs';
import {join} from 'path';
import {
  imageUrl,
  parseSearchPage,
  searchOpenclipart,
  searchUrl,
} from '../src/search-core/adapters/openclipart';
import {fullUrl} from '../src/search-core/registry';
import {USER_AGENT} from '../src/config';
import {createContext, FetchLike} from '../src/search-core/fetcher';

const ctx = (fetch: FetchLike) =>
  createContext({fetch, userAgent: USER_AGENT, languages: ['en']});

const fixture = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf8');

describe('parseSearchPage', () => {
  it('reads the captured soup page', () => {
    const outcome = parseSearchPage(fixture('openclipart-soup.html'));
    if (!outcome.ok) {
      throw new Error(outcome.message);
    }
    expect(outcome.value.results).toHaveLength(32);
    const ladle = outcome.value.results[1];
    expect(ladle.id).toBe('openclipart:340609');
    expect(ladle.title).toBe('Ladle with Hot Soup');
    expect(ladle.thumbUrl).toBe('https://openclipart.org/image/400px/340609');
    expect(fullUrl(ladle, 800)).toBe(
      'https://openclipart.org/image/800px/340609',
    );
    expect(ladle.license).toBe('CC0 1.0');
  });

  it('reads the captured no-result page as a real empty result', () => {
    expect(parseSearchPage(fixture('openclipart-none.html'))).toEqual({
      ok: true,
      value: {results: []},
    });
  });

  it('decodes entities and drops repeated ids', () => {
    const html =
      '<h2> 2 clipart for "x"</h2>' +
      '<a href="/detail/1/a"><img src="/image/200px/1" alt="Fish &amp; chips" /></a>' +
      '<a href="/detail/1/a"><img alt="again" /></a>';
    const outcome = parseSearchPage(html);
    expect(outcome.ok && outcome.value.results.map(r => r.title)).toEqual([
      'Fish & chips',
    ]);
  });

  it('fails on a page that is not a search page', () => {
    expect(parseSearchPage('<html>maintenance</html>')).toEqual({
      ok: false,
      kind: 'parse',
      message: 'no result count on the page',
    });
  });

  it('fails when results are counted but the markup changed', () => {
    const outcome = parseSearchPage(
      '<h2> 79 clipart for "soup"</h2><div class="new-markup"></div>',
    );
    expect(outcome.ok).toBe(false);
  });
});

describe('URLs', () => {
  it('encodes the query', () => {
    expect(searchUrl(' red wine ')).toBe(
      'https://openclipart.org/search/?query=red%20wine',
    );
  });

  it('rounds the width', () => {
    expect(imageUrl('7', 399.6)).toBe('https://openclipart.org/image/400px/7');
  });
});

describe('searchOpenclipart', () => {
  it('fetches the search page with the User-Agent and parses it', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(fixture('openclipart-soup.html')),
    });
    const outcome = await searchOpenclipart('soup', ctx(fetch));
    expect(outcome.ok && outcome.value.results.length).toBe(32);
    expect(fetch.mock.calls[0][0]).toBe(
      'https://openclipart.org/search/?query=soup',
    );
    expect(fetch.mock.calls[0][1].headers['User-Agent']).toMatch(/^Ink2Pic\//);
  });

  it('keeps fewer, smaller thumbnails with the data saver (#70)', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(fixture('openclipart-soup.html')),
    });
    const outcome = await searchOpenclipart('soup', {
      ...ctx(fetch),
      dataSaver: true,
    });
    const results = outcome.ok ? outcome.value.results : [];
    expect(results).toHaveLength(12);
    expect(results[0].thumbUrl).toMatch(/\/image\/200px\//);
  });

  it('passes a fetch failure through', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue({ok: false, status: 503, text: jest.fn()});
    expect(await searchOpenclipart('soup', ctx(fetch))).toEqual({
      ok: false,
      kind: 'http',
      message: 'HTTP 503',
    });
  });
});
