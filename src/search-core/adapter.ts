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
  /**
   * The person's «Photos too» style (#70): photos are not ranked below drawings, and Commons
   * asks for every picture at once instead of drawings first. Absent means drawings first.
   */
  photos?: boolean;
  /**
   * The person's data saver (#70): each source asks for fewer results and smaller thumbnails,
   * for a weak Wi-Fi. Absent means off.
   */
  dataSaver?: boolean;
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
  /**
   * Matches the word against data shipped in the plugin, with no request, while its pictures
   * may still need the network (OpenMoji). With every other source down for the network, its
   * answer counts only when a result's picture is saved (`offlinePicture`, #91); else the search
   * shows as offline (#82).
   */
  localIndex?: true;
};
