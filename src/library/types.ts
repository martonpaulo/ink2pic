import type {SourceName} from '../search-core';

/** One inserted picture with what is needed to reuse and credit it (brief section 8.6). */
export type LibraryItem = {
  /** `<source>:<source id>`, the same id as its SearchResult. */
  id: string;
  source: SourceName;
  sourceId: string;
  sourceUrl: string;
  query: string;
  license: string;
  attribution: string;
  /** ISO 8601. */
  savedAt: string;
  path: string;
  /** The width asked of the source; null when unknown. */
  width: number | null;
  height: number | null;
};

export type Library = {items: LibraryItem[]; recentSearches: string[]};
