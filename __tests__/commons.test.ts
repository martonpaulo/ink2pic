import {readFileSync} from 'fs';
import {join} from 'path';
import {
  COMMONS_WIDTHS,
  commonsFiles,
  DRAWING_FILTER,
  filesUrl,
  nearestWidth,
  parseFilesResponse,
  parseSearchResponse,
  resizeThumb,
  searchCommons,
  searchUrl,
} from '../src/search-core/adapters/commons';
import {PAGE_SIZE} from '../src/search-core/pages';
import {fullUrl} from '../src/search-core/registry';
import {USER_AGENT} from '../src/config';
import {createContext, FetchLike} from '../src/search-core/fetcher';

const ctx = (fetch: FetchLike) =>
  createContext({fetch, userAgent: USER_AGENT, languages: ['en']});

const fixture = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf8');

describe('parseSearchResponse', () => {
  it('maps the documented response to ranked results with license and attribution', () => {
    const outcome = parseSearchResponse(fixture('commons-soup.json'));
    if (!outcome.ok) {
      throw new Error(outcome.message);
    }
    expect(outcome.results.map(r => r.id)).toEqual([
      'commons:1001',
      'commons:2002',
    ]);
    const [bowl, engraving] = outcome.results;
    expect(bowl.title).toBe('Example bowl of soup');
    expect(bowl.license).toBe('CC BY-SA 4.0');
    expect(bowl.attribution).toBe('Example Artist');
    expect(bowl.thumbUrl).toMatch(/\/330px-Example_bowl_of_soup\.jpg$/);
    expect(fullUrl(bowl, 700)).toMatch(/\/960px-Example_bowl_of_soup\.jpg$/);
    expect(engraving.attribution).toBe('Example Archive');
    expect(engraving.mime).toBe('image/png');
  });

  it('reads a search with no hits as a real empty result', () => {
    expect(parseSearchResponse(fixture('commons-none.json'))).toEqual({
      ok: true,
      results: [],
    });
  });

  it('maps a rate limit to throttled', () => {
    const outcome = parseSearchResponse(fixture('commons-ratelimited.json'));
    expect(outcome.ok === false && outcome.kind).toBe('throttled');
  });

  it('maps another API error to http', () => {
    const outcome = parseSearchResponse(
      '{"error":{"code":"badvalue","info":"x"}}',
    );
    expect(outcome).toEqual({ok: false, kind: 'http', message: 'badvalue: x'});
  });

  it('fails on a body with neither query nor error', () => {
    expect(parseSearchResponse('{}').ok).toBe(false);
    expect(parseSearchResponse('<html>').ok).toBe(false);
  });
});

describe('widths', () => {
  it('never requests a width outside the predefined set', () => {
    for (const width of [1, 21, 333, 700, 5000]) {
      expect(COMMONS_WIDTHS).toContain(nearestWidth(width));
    }
    expect(nearestWidth(330)).toBe(330);
    expect(nearestWidth(5000)).toBe(3840);
  });

  it('puts only predefined widths and a bounded limit in the URL', () => {
    expect(searchUrl('soup', {thumbWidth: 400, limit: 50})).toContain(
      'iiurlwidth=500',
    );
    expect(searchUrl('soup', {limit: 50})).toContain('gsrlimit=18');
    expect(searchUrl('soup', {limit: 1})).toContain('gsrlimit=12');
    expect(searchUrl('Napoleon Bonaparte')).toContain(
      'gsrsearch=Napoleon%20Bonaparte',
    );
  });
});

describe('searchCommons', () => {
  it('sends both User-Agent headers', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(fixture('commons-none.json')),
    });
    await searchCommons('soup', ctx(fetch));
    const headers = fetch.mock.calls[0][1].headers;
    expect(headers['User-Agent']).toMatch(
      /^Ink2Pic\/.+github\.com\/martonpaulo\/ink2pic/,
    );
    expect(headers['Api-User-Agent']).toBe(headers['User-Agent']);
  });

  it('reports HTTP 429 as throttled after its one retry (#65)', async () => {
    jest.useFakeTimers();
    const fetch = jest
      .fn()
      .mockResolvedValue({ok: false, status: 429, text: jest.fn()});
    const pending = searchCommons('soup', ctx(fetch));
    await jest.advanceTimersByTimeAsync(400);
    expect(await pending).toEqual({
      ok: false,
      kind: 'throttled',
      message: 'HTTP 429',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });
});

describe('non-object bodies (#23)', () => {
  it('reports a JSON null as a parse failure instead of throwing', () => {
    expect(parseSearchResponse('null')).toEqual({
      ok: false,
      kind: 'parse',
      message: 'the response is not a JSON object',
    });
  });
});

describe('resizeThumb (#24)', () => {
  it('keeps the page prefix of a paged file', () => {
    const base =
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Example.pdf';
    expect(resizeThumb(`${base}/page1-330px-Example.pdf.jpg`, 700)).toBe(
      `${base}/page1-960px-Example.pdf.jpg`,
    );
    expect(resizeThumb(`${base}/lossy-page2-330px-Example.pdf.jpg`, 1)).toBe(
      `${base}/lossy-page2-20px-Example.pdf.jpg`,
    );
    expect(resizeThumb(`${base}/330px-Example.png`, 500)).toBe(
      `${base}/500px-Example.png`,
    );
  });
});

describe('full width (#48)', () => {
  const page = (width: number, mime: string, name: string) =>
    JSON.stringify({
      batchcomplete: true,
      query: {
        pages: [
          {
            pageid: 1,
            title: `File:${name}`,
            index: 1,
            imageinfo: [
              {
                width,
                mime,
                url: `https://upload.wikimedia.org/wikipedia/commons/1/1a/${name}`,
                thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/${name}/330px-${name}`,
              },
            ],
          },
        ],
      },
    });
  const firstUrl = (text: string, width: number) => {
    const outcome = parseSearchResponse(text);
    if (!outcome.ok) {
      throw new Error(outcome.message);
    }
    return fullUrl(outcome.results[0], width);
  };

  it('takes the original of a picture narrower than the width, never an upscale', () => {
    expect(firstUrl(page(576, 'image/jpeg', 'Narrow.jpg'), 960)).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/1/1a/Narrow.jpg',
    );
    expect(firstUrl(page(960, 'image/png', 'Exact.png'), 960)).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/1/1a/Exact.png',
    );
  });

  it('keeps the predefined thumbnail of a wider picture', () => {
    expect(firstUrl(page(2000, 'image/jpeg', 'Wide.jpg'), 960)).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Wide.jpg/960px-Wide.jpg',
    );
  });

  it('keeps the rendered thumbnail of an original insertImage cannot read', () => {
    expect(firstUrl(page(300, 'image/svg+xml', 'Line.svg'), 960)).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Line.svg/960px-Line.svg',
    );
  });
});

describe('drawings and canonical files (#43)', () => {
  const ok = (text: string) => ({
    ok: true,
    status: 200,
    text: () => Promise.resolve(text),
  });
  const pages = (count: number) =>
    JSON.stringify({
      batchcomplete: true,
      query: {
        pages: Array.from({length: count}, (_, i) => ({
          pageid: 100 + i,
          title: `File:Example ${i}.svg`,
          index: i + 1,
          imageinfo: [
            {
              mime: 'image/svg+xml',
              thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Example_${i}.svg/330px-Example_${i}.svg.png`,
            },
          ],
        })),
      },
    });

  it('asks Commons for drawings', () => {
    expect(searchUrl('apple', {drawings: true})).toContain(
      `gsrsearch=${encodeURIComponent(`apple ${DRAWING_FILTER}`)}`,
    );
    expect(searchUrl('apple')).not.toContain('filetype');
  });

  it('drops PDF scans and videos, which are not pictures', () => {
    const outcome = parseSearchResponse(fixture('commons-mixed.json'));
    expect(outcome.ok && outcome.results.map(r => r.id)).toEqual([
      'commons:7007',
    ]);
  });

  it('makes one request when the drawings fill a page', async () => {
    const fetch = jest.fn().mockResolvedValue(ok(pages(PAGE_SIZE)));
    const outcome = await searchCommons('apple', ctx(fetch));
    expect(outcome.ok && outcome.results).toHaveLength(PAGE_SIZE);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toContain('filetype%3Adrawing');
  });

  it('adds a plain search when the drawings do not fill a page', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(ok(pages(1)))
      .mockResolvedValueOnce(ok(pages(3)));
    const outcome = await searchCommons('okra soup', ctx(fetch));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).not.toContain('filetype');
    // The drawing comes first; the file both searches found is shown once.
    expect(outcome.ok && outcome.results.map(r => r.id)).toEqual([
      'commons:100',
      'commons:101',
      'commons:102',
    ]);
  });

  it('keeps the drawings when the plain search fails', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(ok(pages(1)))
      .mockResolvedValueOnce({ok: false, status: 429, text: jest.fn()});
    const outcome = await searchCommons('okra soup', ctx(fetch));
    expect(outcome.ok && outcome.results.map(r => r.id)).toEqual([
      'commons:100',
    ]);
  });

  it('reads named files in the order asked, leaving out a missing one', () => {
    const outcome = parseFilesResponse(fixture('commons-files.json'), [
      'Example portrait.jpg',
      'Example missing picture.png',
      'Example flag.svg',
    ]);
    if (!outcome.ok) {
      throw new Error(outcome.message);
    }
    expect(outcome.results.map(r => r.title)).toEqual([
      'Example portrait',
      'Example flag',
    ]);
    expect(outcome.results[0].license).toBe('CC BY-SA 4.0');
    expect(outcome.results[1].thumbUrl).toContain('330px-Example_flag.svg.png');
  });

  it('asks for every named file in one request, and none for no file', async () => {
    expect(filesUrl(['A b.jpg', 'C.svg'])).toContain(
      `titles=${encodeURIComponent('File:A b.jpg|File:C.svg')}`,
    );
    const fetch = jest.fn();
    expect(await commonsFiles([], ctx(fetch))).toEqual({ok: true, results: []});
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('the spelling suggestion (#65)', () => {
  it('asks for it in the same request', () => {
    const url = searchUrl('Instituto Conficio', {drawings: true});
    expect(url).toContain('list=search');
    expect(url).toContain(
      `srsearch=${encodeURIComponent('Instituto Conficio filetype:drawing')}`,
    );
    expect(url).toContain('srinfo=suggestion');
    expect(url).toContain('srlimit=1');
    expect(url).toContain('srprop=&');
  });

  it('reads it without the filter keyword', () => {
    expect(
      parseSearchResponse(
        fixture('commons-suggestion.json'),
        'Instituto Conficio',
      ),
    ).toEqual({ok: true, results: [], suggestion: 'instituto confúcio'});
  });

  it('gives none when it only repeats the query', () => {
    const same = JSON.stringify({
      batchcomplete: true,
      query: {searchinfo: {suggestion: 'soup filetype:drawing'}, search: []},
    });
    expect(parseSearchResponse(same, 'Soup')).toEqual({ok: true, results: []});
  });

  it('passes the suggestion of either Commons request on', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(fixture('commons-suggestion.json')),
    });
    expect(await searchCommons('Instituto Conficio', ctx(fetch))).toEqual({
      ok: true,
      results: [],
      suggestion: 'instituto confúcio',
    });
  });
});
