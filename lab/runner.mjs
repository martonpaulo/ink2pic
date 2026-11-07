/**
 * One pass of the cases through the product search (#63): the search core's `searchAll` over
 * `DEFAULT_ADAPTERS`, with the context `deviceContext` builds on the Supernote, without the
 * device's cache and breaker, so each query is judged on its own. A fault replaces one source's
 * fetch, never product code.
 */
import {execFileSync} from 'node:child_process';
import {
  cachedFetch,
  HTTP_OK,
  HTTP_TOO_MANY,
  MS_PER_S,
  product,
  ROOT_DIR,
  sleep,
} from './lib.mjs';

/** Between two queries that asked the network: one query at a time, as a person searches. */
const QUERY_DELAY_MS = 2000;
/**
 * Failures that say nothing about the ranking: the query is asked again once, after a short wait,
 * and is then recorded as it failed. A later pass of the same run asks the network only for what
 * failed, so a throttled minute costs a pass, not an hour.
 */
const RETRY_KINDS = new Set(['throttled', 'timeout', 'network']);
const ATTEMPTS = 2;
const RETRY_WAIT_S = 5;
const HTTP_SERVER_ERROR = 500;
/** What a source answers that is not its usual page or JSON: a captive portal, an outage page. */
const MALFORMED_BODY = '<html><body>Service unavailable</body></html>';

const {core, rank, config, copy} = product();
export const SOURCE_NAMES = core.DEFAULT_ADAPTERS.map(adapter => adapter.name);
/**
 * shortcut: the device's query languages, copied from src/search/device.ts, which imports the
 * device storage; import them once they live in a pure module (#68).
 */
const LANGUAGES = ['en'];
/**
 * shortcut: the sentence of each search state, copied from STATE_COPY in src/flow/search.ts,
 * which imports the device library; import it once it lives in a pure module.
 */
const STATE_COPY = {
  ready: null,
  corrected: 'search.corrected',
  stale: 'search.stale',
  partial: 'error.sourceDown',
  empty: 'search.empty',
  offline: 'error.offline',
  failed: 'error.sourcesDown',
};

const answer = (status, body) => async () => ({
  ok: status === HTTP_OK,
  status,
  text: async () => body,
});

/** Each fault as the FetchLike a source sees. */
export const FAULTS = {
  // No connection: fetch rejects, as it does with no route or no DNS answer.
  down: () => async () => {
    throw new TypeError('fetch failed');
  },
  // No answer: the request hangs until the source's own timeout aborts it.
  slow: () => (_url, init) =>
    new Promise((_resolve, reject) =>
      init.signal.addEventListener('abort', () => reject(new Error('aborted'))),
    ),
  throttled: () => answer(HTTP_TOO_MANY, ''),
  broken: () => answer(HTTP_SERVER_ERROR, ''),
  malformed: () => answer(HTTP_OK, MALFORMED_BODY),
};
const ALIASES = {[HTTP_TOO_MANY]: 'throttled', [HTTP_SERVER_ERROR]: 'broken'};

/** `commons=429,wikidata=slow` as `{commons: 'throttled', wikidata: 'slow'}`. */
export function parseFaults(spec = '') {
  const faults = {};
  for (const part of spec.split(',').filter(Boolean)) {
    const [source, given] = part.split('=');
    const kind = ALIASES[given] ?? given;
    if (!SOURCE_NAMES.includes(source) || !FAULTS[kind]) {
      throw new Error(
        `a fault is <source>=<kind>: sources ${SOURCE_NAMES.join(', ')}; ` +
          `kinds ${Object.keys(FAULTS).join(', ')}, 429, 500; got "${part}"`,
      );
    }
    faults[source] = kind;
  }
  return faults;
}

/** The search state the product names for an outcome, and the line the screen shows for it. */
export function notice(outcome) {
  const state = core.searchState(outcome);
  const key = STATE_COPY[state.kind];
  const text = key && copy.copy[key].replace('{query}', state.query);
  return {state: state.kind, text};
}

function tile(result, query) {
  return {
    id: result.id,
    source: result.source,
    title: result.title,
    mime: result.mime ?? null,
    thumb: result.thumbUrl,
    canonical: result.canonical === true,
    score: result.canonical ? null : rank.einkScore(result, query),
  };
}

const context = fetch =>
  core.createContext({
    fetch,
    userAgent: config.USER_AGENT,
    languages: LANGUAGES,
  });

/** The default adapters; a faulty one searches with its fault's fetch in place of the network. */
function adaptersWith(faults) {
  return core.DEFAULT_ADAPTERS.map(adapter => {
    const fault = faults[adapter.name];
    if (!fault) {
      return adapter;
    }
    const ctx = context(FAULTS[fault]());
    return {...adapter, search: query => adapter.search(query, ctx)};
  });
}

/** The search, again after a wait while a source with no injected fault failed to answer. */
async function searchCase(query, faults, log) {
  const stats = {requests: 0, retryAfter: 0, waited: 0};
  for (let attempt = 1; ; attempt++) {
    stats.retryAfter = 0;
    const outcome = await core.searchAll(query, adaptersWith(faults), {
      ctx: context(cachedFetch(stats)),
    });
    const failed = Object.entries(outcome.statuses).filter(
      ([, status]) => status.state === 'failed',
    );
    const retry = failed.some(
      ([source, status]) => !faults[source] && RETRY_KINDS.has(status.kind),
    );
    const named = failed.map(([source, status]) => `${source} ${status.kind}`);
    if (!retry || attempt === ATTEMPTS) {
      return {outcome, named, attempt, ...stats};
    }
    log(`  ${named.join(', ')}: again in ${RETRY_WAIT_S} s`);
    stats.waited += RETRY_WAIT_S;
    await sleep(RETRY_WAIT_S * MS_PER_S);
  }
}

/**
 * Every case through the search with `faults`, one at a time; each case's pages 1 and 2, with the
 * seconds it took and the seconds of that spent waiting after a failure. `onCase` gets the cases
 * done so far after each one.
 */
export async function runCases(
  cases,
  faults = {},
  log = console.log,
  onCase = () => {},
) {
  const out = [];
  for (const [index, item] of cases.entries()) {
    const started = Date.now();
    const {outcome, named, attempt, requests, retryAfter, waited} =
      await searchCase(item.query, faults, log);
    out.push({
      ...item,
      statuses: outcome.statuses,
      sourceDown: outcome.sourceDown,
      allFailed: outcome.allFailed,
      notice: notice(outcome),
      correctedQuery: outcome.correctedQuery ?? null,
      attempts: attempt,
      seconds: Math.round((Date.now() - started) / MS_PER_S),
      waited,
      // The longest Retry-After a source sent, in seconds: how long it asked the lab to wait.
      retryAfter,
      total: outcome.results.length,
      page1: core.pageOf(outcome.results, 0).map(r => tile(r, item.query)),
      page2: core.pageOf(outcome.results, 1).map(r => tile(r, item.query)),
    });
    const failures = named.length ? `, failed: ${named.join(', ')}` : '';
    log(
      `${index + 1}/${cases.length} ${item.id}: ${
        outcome.results.length
      } results, ` + `${requests} requests${failures}`,
    );
    onCase(out);
    if (requests) {
      await sleep(QUERY_DELAY_MS);
    }
  }
  return out;
}

/** The commit the run measured, marked when `src/` differs from it. */
export function commit() {
  const git = args =>
    execFileSync('git', args, {cwd: ROOT_DIR, encoding: 'utf8'}).trim();
  const dirty = git(['status', '--porcelain', '--', 'src'])
    ? ' (src changed)'
    : '';
  return git(['rev-parse', 'HEAD']) + dirty;
}
