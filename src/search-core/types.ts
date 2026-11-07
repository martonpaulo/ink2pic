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
  /**
   * A picture that leads the page: a symbol for a word that is abstract or that it names exactly
   * (#67), or the logo of the organisation or brand the query names (#81).
   */
  leads?: true;
  /**
   * An OpenMoji symbol whose picture is saved on the device (#91): it shows and inserts with no
   * network. Set by the app after each search, never by a source.
   */
  offlinePicture?: true;
  /**
   * What the source files the picture under, read by the style rules like its title (#81): on
   * Commons, the file's categories («Apple Inc. logos»). Openclipart's search page sends none.
   */
  tags?: string[];
};

export type SourceName = 'openclipart' | 'commons' | 'openmoji';

/** The source's own id: the part of a result id after `<source>:`. */
export function sourceId(id: string): string {
  return id.slice(id.indexOf(':') + 1);
}

/** Why a request or a source gave nothing: typed, so callers branch on it, never on text. */
export type FailureKind =
  | 'network'
  | 'timeout'
  | 'http'
  | 'throttled'
  | 'parse'
  /** The adapter's own code threw: a fault, never the network (#104). */
  | 'fault';

/**
 * A value, or why there is none (#100): the one result shape of the plugin. `F` is the failure's
 * own fields, such as an SDK call's code or a source's kind.
 */
export type Outcome<T, F extends {ok: false; message: string}> =
  | {ok: true; value: T}
  | F;

/** A failure; `message` is detail for the log, never shown. */
export type Failure = {ok: false; kind: FailureKind; message: string};

/** What a source found: results, possibly a real empty list. */
export type SourceAnswer = {
  results: SearchResult[];
  /** A spelling the source suggests instead of the query, when it has one (#65). */
  suggestion?: string;
};

/** A source's answer, or why there is none (#105). */
export type SourceOutcome = Outcome<SourceAnswer, Failure>;

export function sourceFailure(kind: FailureKind, message: string): Failure {
  return {ok: false, kind, message};
}

/** Results per page: six large tiles (brief section 8.4). Sources size their requests by it (#60). */
export const PAGE_SIZE = 6;
