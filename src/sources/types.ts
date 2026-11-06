/** One picture a source offers, the same shape for every source. */
export type SearchResult = {
  /** Unique across sources: `<source>:<source id>`. */
  id: string;
  source: SourceName;
  title: string;
  thumbUrl: string;
  /**
   * A Commons original and its width, for an insert that takes it as it is (#48, #55); the image
   * URL at a width comes from `fullUrl` in `./registry`.
   */
  original?: {url: string; width: number};
  license: string;
  attribution: string;
  mime?: string;
  /** One of the word's canonical pictures from Wikidata: shown on page 1 (#43). */
  canonical?: boolean;
  /** Set for a library picture: already on the device, inserted without a download. */
  localPath?: string;
  /** The library picture's size, so it can be placed at the lasso too (#33). */
  localSize?: {width: number; height: number};
};

export type SourceName = 'openclipart' | 'commons';

/** The source's own id: the part of a result id after `<source>:`. */
export function sourceId(id: string): string {
  return id.slice(id.indexOf(':') + 1);
}

export type FailureKind =
  | 'network'
  | 'timeout'
  | 'http'
  | 'throttled'
  | 'parse';

/** A source's answer: results (possibly a real empty list) or why there are none. */
export type SourceOutcome =
  | {ok: true; results: SearchResult[]}
  | {ok: false; kind: FailureKind; message: string};

export type SourceFailure = Extract<SourceOutcome, {ok: false}>;

export function sourceFailure(
  kind: FailureKind,
  message: string,
): SourceFailure {
  return {ok: false, kind, message};
}

/** Results per page: six large tiles (brief section 8.4). Sources size their requests by it (#60). */
export const PAGE_SIZE = 6;
