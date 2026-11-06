/**
 * The image URL of any result, per source, in one place: a result is plain data, so a cached one
 * gives the same URL as a fresh one (#54).
 */
import {COMMONS_FULL_WIDTH, fullImageUrl} from './commons';
import {imageUrl, OPENCLIPART_FULL_WIDTH} from './openclipart';
import {SearchResult, SourceName, sourceId} from './types';

type Source = {
  /** The image at a given width; a source may round it to a width it serves. */
  url: (result: SearchResult, width: number) => string;
  /** The width an insert asks for: one the source serves with no redirect and no upscale (#48). */
  insertWidth: number;
};

const SOURCES: Record<SourceName, Source> = {
  openclipart: {
    url: (result, width) => imageUrl(sourceId(result.id), width),
    insertWidth: OPENCLIPART_FULL_WIDTH,
  },
  commons: {
    url: (result, width) =>
      fullImageUrl(result.thumbUrl, width, {
        ...result.original,
        mime: result.mime,
      }),
    insertWidth: COMMONS_FULL_WIDTH,
  },
};

export function isSourceName(name: unknown): name is SourceName {
  return typeof name === 'string' && Object.keys(SOURCES).includes(name);
}

/** The image at `width`; a library picture is its local file. */
export function fullUrl(result: SearchResult, width: number): string {
  return result.localPath
    ? `file://${result.localPath}`
    : SOURCES[result.source].url(result, width);
}

/** The image an insert downloads. */
export function insertUrl(result: SearchResult): string {
  return fullUrl(result, SOURCES[result.source].insertWidth);
}
