/**
 * The default adapters, and the image URL of any result in one place: a result is plain data,
 * so a cached one gives the same URL as a fresh one (#54).
 */
import type {PictureHost, SourceAdapter} from './adapter';
import {commonsAdapter, commonsPictures} from './adapters/commons';
import {openclipartAdapter, openclipartPictures} from './adapters/openclipart';
import {openmojiAdapter, openmojiPictures} from './adapters/openmoji';
import {wikidataAdapter} from './adapters/wikidata';
import {SearchResult, SourceName} from './types';

/**
 * Searched in parallel, in this order; Wikidata adds the word's canonical pictures (#43), OpenMoji
 * the symbols of abstract words, matched on the device (#67). A setting switches a source off by
 * its `name` (#70).
 */
export const DEFAULT_ADAPTERS: readonly SourceAdapter[] = [
  openclipartAdapter,
  commonsAdapter,
  wikidataAdapter,
  openmojiAdapter,
];

/** The host of each source that owns results; Wikidata's results are Commons files. */
const HOSTS: Record<SourceName, PictureHost> = {
  openclipart: openclipartPictures,
  commons: commonsPictures,
  openmoji: openmojiPictures,
};

export function isSourceName(name: unknown): name is SourceName {
  return typeof name === 'string' && Object.keys(HOSTS).includes(name);
}

/** The image at `width`; a library picture is its local file. */
export function fullUrl(result: SearchResult, width: number): string {
  return result.localPath
    ? `file://${result.localPath}`
    : HOSTS[result.source].url(result, width);
}

/** The image an insert downloads. */
export function insertUrl(result: SearchResult): string {
  return fullUrl(result, HOSTS[result.source].insertWidth);
}

/** What the cache keeps of the result's original, or nothing. */
export function storedOriginal(result: SearchResult): SearchResult['original'] {
  return HOSTS[result.source].storedOriginal?.(result);
}
