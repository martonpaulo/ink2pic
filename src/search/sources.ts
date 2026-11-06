/** The default sources, over the platform's fetch; Wikidata adds the word's canonical pictures (#43). */
import {searchCommons} from '../sources/commons';
import type {FetchLike} from '../sources/http';
import {searchOpenclipart} from '../sources/openclipart';
import {searchWikidata} from '../sources/wikidata';
import type {Source} from './search';

export function defaultSources(fetch: FetchLike = globalThis.fetch): Source[] {
  return [
    {name: 'openclipart', search: query => searchOpenclipart(query, {fetch})},
    // Drawings, then a plain search when they fill less than a page.
    {
      name: 'commons',
      search: query => searchCommons(query, {fetch}),
      requests: 2,
    },
    // The item, then its files from Commons.
    {
      name: 'wikidata',
      search: query => searchWikidata(query, {fetch}),
      requests: 2,
      supplement: true,
    },
  ];
}
