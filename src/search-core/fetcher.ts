/**
 * The one way the core reaches the network: adapters get a `Fetcher` in their context and never
 * call `fetch` themselves. It sets the User-Agent, holds the per-request timeout and maps every
 * answer to a typed outcome; it never throws.
 */
import type {SourceContext} from './adapter';
import {Clock, Log, noLog, systemClock} from './clock';
import {Failure, FailureKind} from './types';

/** About 5 s per request, so a slow source never blocks the other (brief section 8.5). */
export const SOURCE_TIMEOUT_MS = 5000;

const HTTP_FORBIDDEN = 403;
const HTTP_TOO_MANY = 429;
/** MediaWiki error codes that mean "slow down", on Commons and Wikidata alike. */
const THROTTLE_CODES = new Set(['ratelimited', 'maxlag']);

/** The platform's `fetch`, as much of it as the core uses. */
export type FetchLike = (
  url: string,
  init: {headers: Record<string, string>; signal: AbortSignal},
) => Promise<{ok: boolean; status: number; text: () => Promise<string>}>;

export type TextOutcome = {ok: true; text: string} | Failure;

/** GETs a text body; extra headers join the User-Agent. */
export type Fetcher = (
  url: string,
  headers?: Record<string, string>,
) => Promise<TextOutcome>;

export type FetcherOptions = {
  fetch: FetchLike;
  /** Wikimedia's policy asks for the plugin, its version and a contact page. */
  userAgent: string;
  clock?: Clock;
  log?: Log;
  timeoutMs?: number;
};

function failure(kind: FailureKind, message: string): Failure {
  return {ok: false, kind, message};
}

export function createFetcher({
  fetch,
  userAgent,
  clock = systemClock,
  timeoutMs = SOURCE_TIMEOUT_MS,
}: FetcherOptions): Fetcher {
  return async (url, headers = {}) => {
    const controller = new AbortController();
    const cancel = clock.after(timeoutMs, () => controller.abort());
    try {
      const response = await fetch(url, {
        headers: {'User-Agent': userAgent, ...headers},
        signal: controller.signal,
      });
      if (
        response.status === HTTP_FORBIDDEN ||
        response.status === HTTP_TOO_MANY
      ) {
        return failure('throttled', `HTTP ${response.status}`);
      }
      if (!response.ok) {
        return failure('http', `HTTP ${response.status}`);
      }
      return {ok: true, text: await response.text()};
    } catch (error) {
      if (controller.signal.aborted) {
        return failure('timeout', `no answer in ${timeoutMs} ms`);
      }
      return failure(
        'network',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      cancel();
    }
  };
}

/** A MediaWiki API `error` object as a failure. */
export function apiFailure(error: {code?: string; info?: string}): Failure {
  const kind = THROTTLE_CODES.has(error.code ?? '') ? 'throttled' : 'http';
  return failure(kind, `${error.code}: ${error.info}`);
}

/** The context adapters search with: one fetcher and the log. */
export function createContext(options: FetcherOptions): SourceContext {
  return {
    fetch: createFetcher(options),
    userAgent: options.userAgent,
    log: options.log ?? noLog,
  };
}
