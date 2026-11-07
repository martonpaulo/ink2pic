/** The search core's public API; see README.md. Nothing here imports the platform. */
export type {PictureHost, SourceAdapter, SourceContext} from './adapter';
export {commonsAdapter} from './adapters/commons';
export {openclipartAdapter} from './adapters/openclipart';
export {
  openmojiAdapter,
  pictureUrl as openmojiPictureUrl,
  symbolHexes,
} from './adapters/openmoji';
export {wikidataAdapter} from './adapters/wikidata';
export {forgetKnownHit, resolvePhrase} from './phrase';
export type {PhraseChoice} from './phrase';
export {createBreaker} from './breaker';
export type {Breaker} from './breaker';
export {cachedSearch} from './cache';
export type {CachedSearch, CacheOptions, TextStore} from './cache';
export {noLog, systemClock, withinLimit} from './clock';
export type {Clock, Log} from './clock';
export {dropNearDuplicates} from './duplicates';
export {createContext, createFetcher} from './fetcher';
export type {Fetcher, FetchLike} from './fetcher';
export {
  chooseLook,
  isFaintLines,
  isSpeckled,
  lineArt,
  MEASURED_RESULTS,
  needsContour,
  orderMeasured,
  pixelKind,
  pixelScorer,
  reorderByMeasures,
} from './measures';
export type {
  ConvertedImage,
  ImageAnalyzer,
  Look,
  Measured,
  Measures,
  PixelKind,
  Prepared,
} from './measures';
export {pageCount, pageOf} from './pages';
export {DEFAULT_SCORERS, einkScore, rankForEink} from './rank';
export type {Scorer} from './rank';
export {DEFAULT_ADAPTERS, fullUrl, insertUrl, isSourceName} from './registry';
export {searchAll} from './search';
export type {SearchOptions, SearchOutcome, SourceStatus} from './search';
export {networkDown, searchState} from './state';
export type {SearchState, SearchStateKind} from './state';
export {PAGE_SIZE, sourceId} from './types';
export type {
  Failure,
  FailureKind,
  Outcome,
  SearchResult,
  SourceName,
} from './types';
