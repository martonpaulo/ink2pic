/** One picture a source offers, the same shape for every source. */
export type SearchResult = {
  /** Unique across sources: `<source>:<source id>`. */
  id: string;
  source: SourceName;
  title: string;
  thumbUrl: string;
  /** The image at a given width; a source may round it to a width it serves. */
  fullUrl: (width: number) => string;
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
