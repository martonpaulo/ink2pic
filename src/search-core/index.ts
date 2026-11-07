/** The search core's public API; see README.md. Nothing here imports the platform. */
export type {PictureHost, SourceAdapter, SourceContext} from './adapter';
export {commonsAdapter} from './adapters/commons';
export {openclipartAdapter} from './adapters/openclipart';
export {openmojiAdapter} from './adapters/openmoji';
export {wikidataAdapter} from './adapters/wikidata';
export {createBreaker} from './breaker';
export type {Breaker} from './breaker';
export {cachedSearch} from './cache';
export type {CachedSearch, CacheOptions, TextStore} from './cache';
export {noLog, systemClock} from './clock';
export type {Clock, Log} from './clock';
export {createContext, createFetcher} from './fetcher';
export type {Fetcher, FetchLike} from './fetcher';
export {
  lineArt,
  MEASURED_RESULTS,
  needsContour,
  pixelKind,
  pixelScorer,
  reorderByMeasures,
} from './measures';
export type {
  ConvertedImage,
  ImageAnalyzer,
  Measured,
  Measures,
  PixelKind,
} from './measures';
export {pageCount, pageOf} from './pages';
export {DEFAULT_SCORERS, rankForEink} from './rank';
export type {Scorer} from './rank';
export {DEFAULT_ADAPTERS, fullUrl, insertUrl, isSourceName} from './registry';
export {searchAll} from './search';
export type {SearchOptions, SearchOutcome, SourceStatus} from './search';
export {searchState} from './state';
export type {SearchState, SearchStateKind} from './state';
export {PAGE_SIZE, sourceId} from './types';
export type {Failure, FailureKind, SearchResult, SourceName} from './types';
