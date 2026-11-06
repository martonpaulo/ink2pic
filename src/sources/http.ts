import {USER_AGENT} from '../config';
import {FailureKind, SourceFailure, sourceFailure} from './types';

/** About 5 s per source, so a slow source never blocks the other (brief section 8.5). */
export const SOURCE_TIMEOUT_MS = 5000;

const HTTP_FORBIDDEN = 403;
/** MediaWiki error codes that mean "slow down", on Commons and Wikidata alike. */
const THROTTLE_CODES = new Set(['ratelimited', 'maxlag']);
const HTTP_TOO_MANY = 429;

export type FetchLike = (
  url: string,
  init: {headers: Record<string, string>; signal: AbortSignal},
) => Promise<{ok: boolean; status: number; text: () => Promise<string>}>;

export type HttpDeps = {fetch: FetchLike; timeoutMs?: number};

export type TextOutcome =
  | {ok: true; text: string}
  | {ok: false; kind: FailureKind; message: string};

/** GET a text body with the plugin's User-Agent and a timeout; never throws. */
export async function fetchText(
  url: string,
  {fetch, timeoutMs = SOURCE_TIMEOUT_MS}: HttpDeps,
  headers: Record<string, string> = {},
): Promise<TextOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {'User-Agent': USER_AGENT, ...headers},
      signal: controller.signal,
    });
    if (
      response.status === HTTP_FORBIDDEN ||
      response.status === HTTP_TOO_MANY
    ) {
      return {ok: false, kind: 'throttled', message: `HTTP ${response.status}`};
    }
    if (!response.ok) {
      return {ok: false, kind: 'http', message: `HTTP ${response.status}`};
    }
    return {ok: true, text: await response.text()};
  } catch (error) {
    if (controller.signal.aborted) {
      return {
        ok: false,
        kind: 'timeout',
        message: `no answer in ${timeoutMs} ms`,
      };
    }
    return {
      ok: false,
      kind: 'network',
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** A MediaWiki API `error` object as a source failure. */
export function apiFailure(error: {
  code?: string;
  info?: string;
}): SourceFailure {
  const kind = THROTTLE_CODES.has(error.code ?? '') ? 'throttled' : 'http';
  return sourceFailure(kind, `${error.code}: ${error.info}`);
}
