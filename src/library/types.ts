import type {SourceName} from '../sources/types';

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
  width: number;
  height: number;
};

export type Library = {items: LibraryItem[]; recentSearches: string[]};

/** Text files on the device; `readText` gives null when the file does not exist. */
export type TextStorage = {
  readText: (path: string) => Promise<string | null>;
  writeText: (path: string, text: string) => Promise<void>;
};
