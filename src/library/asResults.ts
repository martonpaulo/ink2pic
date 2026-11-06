/** Library pictures as grid results: local files, inserted without a download (#15). */
import type {SearchResult} from '../search-core';
import type {LibraryItem} from './types';

export function libraryResults(items: LibraryItem[]): SearchResult[] {
  return items.map(item => ({
    id: `library:${item.id}`,
    source: item.source,
    title: item.query,
    thumbUrl: `file://${item.path}`,
    license: item.license,
    attribution: item.attribution,
    localPath: item.path,
    localSize:
      item.width !== null && item.height !== null
        ? {width: item.width, height: item.height}
        : undefined,
  }));
}
