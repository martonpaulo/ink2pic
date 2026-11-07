/**
 * What every lab script shares (#63): the paths, the product modules, a run's files, and polite
 * cached downloads. Raw responses and thumbnails are kept in `lab/out/.cache`, so a second run
 * of the same queries asks the sources nothing.
 */
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const LAB_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.dirname(LAB_DIR);
export const OUT_DIR = path.join(LAB_DIR, 'out');
export const CACHE_DIR = path.join(OUT_DIR, '.cache');
const RAW_DIR = path.join(CACHE_DIR, 'raw');
const THUMB_DIR = path.join(CACHE_DIR, 'thumbs');
/** Between two downloads that miss the cache: the sources are free services. */
const THUMB_DELAY_MS = 250;
export const HTTP_OK = 200;
export const HTTP_TOO_MANY = 429;
const THUMB_ATTEMPTS = 2;
const THUMB_RETRY_S = 5;
export const MS_PER_S = 1000;
const EXTENSIONS = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

const require = createRequire(import.meta.url);
require('./ts-hook.cjs');

/**
 * The product's own modules, the same files the app bundles: the search core only through its
 * public API, `index.ts` (#100).
 */
export function product() {
  return {
    core: require('../src/search-core/index.ts'),
    config: require('../src/config.ts'),
    copy: require('../src/ui/copy.ts'),
  };
}

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(data, null, 1)}\n`);
}

export function runDir(name) {
  if (!/^[\w.-]+$/.test(name ?? '')) {
    throw new Error(
      `a run name is letters, digits, dot, dash or underscore: "${name}"`,
    );
  }
  return path.join(OUT_DIR, name);
}

export function readCases() {
  return readJson(path.join(LAB_DIR, 'cases.json')).cases;
}

export function readResults(name) {
  return readJson(path.join(runDir(name), 'results.json'));
}

/** The run's judgment, or an empty one when nobody has judged it yet. */
export function readJudgment(name) {
  const file = path.join(runDir(name), 'judgment.json');
  return fs.existsSync(file) ? readJson(file) : {};
}

const key = url => createHash('sha1').update(url).digest('hex');

/**
 * Node's fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1 (Node 22.21 and later): behind a
 * proxy, a host the machine cannot resolve would fail as «network» and falsify the run.
 */
export function checkProxy() {
  if (process.env.HTTPS_PROXY && process.env.NODE_USE_ENV_PROXY !== '1') {
    throw new Error('HTTPS_PROXY is set: run with NODE_USE_ENV_PROXY=1');
  }
}

/**
 * A FetchLike that answers from the cache, else from the network and keeps a 200 answer. A
 * failure is not kept, so the next run asks again. `stats` counts the real requests and keeps
 * the longest Retry-After a source sent, in seconds.
 */
export function cachedFetch(stats = {requests: 0, retryAfter: 0}) {
  return async (url, init) => {
    const file = path.join(RAW_DIR, `${key(url)}.json`);
    if (fs.existsSync(file)) {
      const kept = readJson(file);
      return {ok: true, status: HTTP_OK, text: async () => kept.body};
    }
    stats.requests += 1;
    const response = await fetch(url, init);
    const body = await response.text();
    if (response.status === HTTP_OK) {
      writeJson(file, {url, body});
    }
    const retryAfter = Number(response.headers.get('retry-after'));
    if (retryAfter > stats.retryAfter) {
      stats.retryAfter = retryAfter;
    }
    return {ok: response.ok, status: response.status, text: async () => body};
  };
}

/** The local file of a thumbnail, downloaded once with the app's User-Agent; null on failure. */
export async function thumbFile(url, userAgent) {
  fs.mkdirSync(THUMB_DIR, {recursive: true});
  const stem = path.join(THUMB_DIR, key(url));
  const found = Object.values(EXTENSIONS)
    .map(extension => stem + extension)
    .find(file => fs.existsSync(file));
  if (found) {
    return found;
  }
  for (let attempt = 1; attempt <= THUMB_ATTEMPTS; attempt++) {
    await sleep(THUMB_DELAY_MS);
    try {
      const response = await fetch(url, {headers: {'User-Agent': userAgent}});
      const type = (response.headers.get('content-type') ?? '').split(';')[0];
      if (response.status === HTTP_OK && EXTENSIONS[type]) {
        const file = stem + EXTENSIONS[type];
        fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
        return file;
      }
      console.warn(`thumb ${url}: HTTP ${response.status} ${type}`);
      if (response.status !== HTTP_TOO_MANY) {
        return null;
      }
      // A short wait, not the source's Retry-After: a missing tile shows as «no thumbnail».
      await sleep(THUMB_RETRY_S * MS_PER_S);
    } catch (error) {
      console.warn(`thumb ${url}: ${error.message}`);
      return null;
    }
  }
  return null;
}

/** Every page-1 thumbnail of a run as a local file, keyed by thumbnail URL. */
export async function pageOneThumbs(results) {
  const files = new Map();
  for (const entry of results.cases) {
    for (const tile of entry.page1) {
      if (!files.has(tile.thumb)) {
        files.set(tile.thumb, await thumbFile(tile.thumb, results.userAgent));
      }
    }
  }
  return files;
}
