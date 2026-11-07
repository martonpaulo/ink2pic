import {readFileSync} from 'fs';
import {join} from 'path';
import type {SourceAdapter} from '../src/search-core/adapter';
import {parseSearchResponse, searchUrl} from '../src/search-core/adapters/commons';
import {hasAdultWords} from '../src/search-core/filters/adult';
import {searchAll} from '../src/search-core/search';
import type {SearchResult} from '../src/search-core/types';

const fixture = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf8');

const clipart = (id: string, title: string): SearchResult => ({
  id: `openclipart:${id}`,
  source: 'openclipart',
  title,
  thumbUrl: 'https://example.test/t',
  license: 'CC0 1.0',
  attribution: 'Openclipart',
});

describe('the adult filter (#69)', () => {
  it.each([
    'Nude woman sketch',
    'PEGI Nudity annotated',
    'KMRB 선정성 (Sex and Nudity)',
    'Femme nue',
    'Nudité',
    'Mujer desnuda',
    'Mulher nua',
    'Nackte Frau',
    'Pornografia',
    'Erotica cover',
    'Female human breasts in art',
    'Nude women with shaved genitalia',
    'Penile-vaginal intercourse in art',
    'Ecchi|Fan service',
  ])('leaves out «%s»', text => {
    expect(hasAdultWords(text)).toBe(true);
  });

  it.each([
    'Sexton beetle',
    'Essex coat of arms',
    'Middlesex map',
    'Nudibranch drawing',
    'Congenital heart defect',
    'Black body realization',
    'Line art of celestial bodies',
    'Breast cancer ribbon',
    'Greek letter nu',
    'Nudo de corbata',
    'Super Bowl XXX logo',
    'Kit body away',
  ])('keeps «%s»', text => {
    expect(hasAdultWords(text)).toBe(false);
  });

  it('asks Commons for the categories in the same request', () => {
    expect(searchUrl('body', {drawings: true})).toContain(
      'iiextmetadatafilter=LicenseShortName|Artist|Credit|Categories',
    );
  });

  it('drops a Commons file by its title or its categories', () => {
    const outcome = parseSearchResponse(fixture('commons-adult.json'), 'body');
    expect(outcome.ok && outcome.value.results.map(r => r.id)).toEqual([
      'commons:112298399',
      'commons:113723433',
      'commons:67057188',
      'commons:3945169',
      'commons:111657181',
    ]);
  });

  it('drops an adult title from any source before ranking', async () => {
    const source: SourceAdapter = {
      name: 'openclipart',
      search: () =>
        Promise.resolve({
          ok: true,
          value: {results: [clipart('1', 'naked woman'), clipart('2', 'woman icon')]},
        }),
    };
    const outcome = await searchAll('woman', [source]);
    expect(outcome.results.map(r => r.id)).toEqual(['openclipart:2']);
  });
});
