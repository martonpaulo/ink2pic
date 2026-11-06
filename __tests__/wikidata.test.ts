import {readFileSync} from 'fs';
import {join} from 'path';
import {
  entityUrl,
  parseEntityResponse,
  searchWikidata,
} from '../src/sources/wikidata';

const fixture = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const ok = (text: string) => ({
  ok: true,
  status: 200,
  text: () => Promise.resolve(text),
});

describe('entityUrl', () => {
  it('looks the item up by its English Wikipedia title, claims only', () => {
    const url = entityUrl(' Napoleon Bonaparte ');
    expect(url).toMatch(/^https:\/\/www\.wikidata\.org\/w\/api\.php\?/);
    expect(url).toContain('action=wbgetentities');
    expect(url).toContain('sites=enwiki');
    expect(url).toContain('titles=Napoleon%20Bonaparte');
    expect(url).toContain('normalize=1');
    expect(url).toContain('props=claims');
  });
});

describe('parseEntityResponse', () => {
  it('takes flag, logo and image in that order, preferred first, never deprecated', () => {
    expect(parseEntityResponse(fixture('wikidata-entity.json'))).toEqual({
      ok: true,
      files: ['Example flag.svg', 'Example portrait.jpg'],
    });
  });

  it('reads a word with no item as a real empty answer', () => {
    expect(parseEntityResponse(fixture('wikidata-missing.json'))).toEqual({
      ok: true,
      files: [],
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
  it('makes two requests and marks the pictures canonical', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(ok(fixture('wikidata-entity.json')))
      .mockResolvedValueOnce(ok(fixture('commons-files.json')));
    const outcome = await searchWikidata('napoleon', {fetch});
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toContain(
      encodeURIComponent('File:Example flag.svg|File:Example portrait.jpg'),
    );
    expect(fetch.mock.calls[0][1].headers['Api-User-Agent']).toMatch(
      /^Ink2Pic\//,
    );
    if (!outcome.ok) {
      throw new Error(outcome.message);
    }
    expect(outcome.results.map(r => [r.title, r.source, r.canonical])).toEqual([
      ['Example flag', 'commons', true],
      ['Example portrait', 'commons', true],
    ]);
  });

  it('makes one request for a word with no item', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue(ok(fixture('wikidata-missing.json')));
    expect(await searchWikidata('qzxv', {fetch})).toEqual({
      ok: true,
      results: [],
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reports a refused host as a failure, not as no pictures', async () => {
    const fetch = jest.fn().mockRejectedValue(new Error('fetch failed'));
    expect(await searchWikidata('apple', {fetch})).toEqual({
      ok: false,
      kind: 'network',
      message: 'fetch failed',
    });
  });
});
