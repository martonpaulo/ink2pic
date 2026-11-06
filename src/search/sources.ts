/** The default sources, over the platform's fetch. */
import {searchCommons} from '../sources/commons';
import type {FetchLike} from '../sources/http';
import {searchOpenclipart} from '../sources/openclipart';
import type {Source} from './search';

export function defaultSources(fetch: FetchLike = globalThis.fetch): Source[] {
  return [
    {name: 'openclipart', search: query => searchOpenclipart(query, {fetch})},
    {name: 'commons', search: query => searchCommons(query, {fetch})},
  ];
}
