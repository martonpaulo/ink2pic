/**
 * The one way the core reaches the network: adapters get a `Fetcher` in their context and never
 * call `fetch` themselves. It sets the User-Agent, holds the per-request timeout and maps every
 * answer to a typed outcome; it never throws.
 */
import type {SourceContext} from './adapter';
import {Clock, Log, noLog, sleep, systemClock} from './clock';
import {Failure, FailureKind} from './types';

/** About 5 s per request, so a slow source never blocks the other (brief section 8.5). */
export const SOURCE_TIMEOUT_MS = 5000;

const HTTP_FORBIDDEN = 403;
const HTTP_TOO_MANY = 429;
const HTTP_SERVER_ERROR = 500;
/** The pause before the one retry: short, so it fits in the request's own budget (#65). */
export const RETRY_DELAY_MS = 400;
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
  /** The whole budget of one request, its retry included. */
  timeoutMs?: number;
  retryDelayMs?: number;
};

type Attempt =
  | TextOutcome
  | {ok: false; kind: FailureKind; message: string; retry: true};

function failure(kind: FailureKind, message: string): Failure {
  return {ok: false, kind, message};
}

/** One GET that gives up at `deadline`; a 429, a 5xx or a network error may be retried. */
async function attempt(
  fetch: FetchLike,
  url: string,
  headers: Record<string, string>,
  clock: Clock,
  budgetMs: number,
  timeoutMs: number,
): Promise<Attempt> {
  const controller = new AbortController();
  const cancel = clock.after(budgetMs, () => controller.abort());
  try {
    const response = await fetch(url, {headers, signal: controller.signal});
    const {status} = response;
    const code = `HTTP ${status}`;
    if (status === HTTP_TOO_MANY) {
      return {...failure('throttled', code), retry: true};
    }
    if (status === HTTP_FORBIDDEN) {
      return failure('throttled', code);
    }
    if (!response.ok) {
      const http = failure('http', code);
      return status >= HTTP_SERVER_ERROR ? {...http, retry: true} : http;
    }
    return {ok: true, text: await response.text()};
  } catch (error) {
    if (controller.signal.aborted) {
      return failure('timeout', `no answer in ${timeoutMs} ms`);
    }
    return {
      ...failure(
        'network',
        error instanceof Error ? error.message : String(error),
      ),
      retry: true,
    };
  } finally {
    cancel();
  }
}

/**
 * One request within `timeoutMs`: a 429, a 5xx or a network error is tried once more after
 * `retryDelayMs`, when the budget still has room for it (#65). Each retry is logged.
 */
export function createFetcher({
  fetch,
  userAgent,
  clock = systemClock,
  log = noLog,
  timeoutMs = SOURCE_TIMEOUT_MS,
  retryDelayMs = RETRY_DELAY_MS,
}: FetcherOptions): Fetcher {
  return async (url, extra = {}) => {
    const headers = {'User-Agent': userAgent, ...extra};
    const deadline = clock.now() + timeoutMs;
    const first = await attempt(
      fetch,
      url,
      headers,
      clock,
      timeoutMs,
      timeoutMs,
    );
    if (first.ok || !('retry' in first)) {
      return first;
    }
    const left = deadline - clock.now() - retryDelayMs;
    if (left <= 0) {
      log(`request ${url}: ${first.message}; no time left to retry`);
      return failure(first.kind, first.message);
    }
    log(`request ${url}: ${first.message}; retrying in ${retryDelayMs} ms`);
    await sleep(clock, retryDelayMs);
    const second = await attempt(fetch, url, headers, clock, left, timeoutMs);
    return second.ok ? second : failure(second.kind, second.message);
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
