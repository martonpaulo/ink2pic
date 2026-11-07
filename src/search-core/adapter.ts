/**
 * What a picture source implements to join the search: one file per source under `adapters/`,
 * listed in `registry.ts`. An adapter reaches the network only through `ctx.fetch`.
 */
import type {Log} from './clock';
import type {Fetcher} from './fetcher';
import type {SearchResult, SourceOutcome} from './types';

export type SourceContext = {
  fetch: Fetcher;
  /** For an API that asks for it in a header of its own (MediaWiki's `Api-User-Agent`). */
  userAgent: string;
  log: Log;
  /**
   * The query languages, tried in this order where a step depends on the language (#68); the
   * app owns the setting and its default, never the core.
   */
  languages: readonly string[];
};

/** How the pictures of a source that owns its results are fetched and kept. */
export type PictureHost = {
  /** The image at a width; the host may round it to a width it serves. */
  url: (result: SearchResult, width: number) => string;
  /** The width an insert asks for: one the host serves with no redirect and no upscale (#48). */
  insertWidth: number;
  /** What the cache keeps of `result.original`, or nothing (#55). */
  storedOriginal?: (result: SearchResult) => SearchResult['original'];
};

export type SourceAdapter = {
  name: string;
  search: (query: string, ctx: SourceContext) => Promise<SourceOutcome>;
  /**
   * Requests the source makes in a row, 1 when absent: each gets the whole timeout, so a slow
   * second request never drops what the first one found (#43). A function when the count
   * depends on the context (one lookup per language).
   */
  requests?: number | ((ctx: SourceContext) => number);
  /**
   * Adds pictures to the other sources (Wikidata, #43): its failure is no «source down» note and
   * does not keep the search out of the cache.
   */
  supplement?: true;
};
