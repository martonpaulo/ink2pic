import {readFileSync} from 'fs';
import {join} from 'path';
import {
  COMMONS_WIDTHS,
  nearestWidth,
  parseSearchResponse,
  searchCommons,
  searchUrl,
} from '../src/sources/commons';

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
    expect(bowl.fullUrl(700)).toMatch(/\/960px-Example_bowl_of_soup\.jpg$/);
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
    await searchCommons('soup', {fetch});
    const headers = fetch.mock.calls[0][1].headers;
    expect(headers['User-Agent']).toMatch(
      /^Ink2Pic\/.+github\.com\/martonpaulo\/ink2pic/,
    );
    expect(headers['Api-User-Agent']).toBe(headers['User-Agent']);
  });

  it('reports HTTP 429 as throttled and does not retry', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue({ok: false, status: 429, text: jest.fn()});
    expect(await searchCommons('soup', {fetch})).toEqual({
      ok: false,
      kind: 'throttled',
      message: 'HTTP 429',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
