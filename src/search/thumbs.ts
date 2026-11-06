/**
 * Thumbnails kept as files in the private plugin folder (#16, brief section 8.5), so a page seen
 * before opens from the device. The first visit to a page still loads from the web: the files
 * are written after the page is shown, one after another, and never hold the grid back.
 */
import {sessionPaths} from '../flow/session';
import {log, logged} from '../log/memory';
import {exists, listFiles} from '../sdk/files';
import {downloadToFile} from '../storage/files';
import {safeFileName} from '../storage/paths';
import type {SearchResult} from '../sources/types';

/** Most thumbnail files kept. DEFAULT: about 100 KB each, so about 30 MB at most. */
export const THUMB_LIMIT = 300;
const THUMB_DIR = 'thumbs';
const WEB_PREFIX = 'https://';
/** The Java module writes `<name>.part` and renames it into place when complete. */
const PART_SUFFIX = '.part';

/** Full paths of the thumbnail files on the device; null until the folder is listed. */
let known: Set<string> | null = null;
/** Downloads run one after another, across pages. */
let queue: Promise<void> = Promise.resolve();

function thumbDir(pluginDir: string): string {
  return `${pluginDir}/${THUMB_DIR}`;
}

export function thumbPath(pluginDir: string, result: SearchResult): string {
  return `${thumbDir(pluginDir)}/${safeFileName(result.id)}`;
}

function isStored(path: string): boolean {
  return known?.has(path) ?? false;
}

/** `file://<path>` when the thumbnail is on the device, else its web URL. */
export function cachedThumbUri(
  result: SearchResult,
  pluginDir: string,
  stored: (path: string) => boolean = isStored,
): string {
  if (!result.thumbUrl.startsWith(WEB_PREFIX)) {
    return result.thumbUrl;
  }
  const path = thumbPath(pluginDir, result);
  return stored(path) ? `file://${path}` : result.thumbUrl;
}

/** Lists the stored thumbnails once per session; an unreadable folder turns the cache off. */
async function listThumbs(pluginDir: string): Promise<Set<string> | null> {
  const dir = thumbDir(pluginDir);
  const listed = await logged('listFiles thumbs', () => listFiles(dir));
  if (listed.ok) {
    // Names or full paths: the device answer is not measured yet, so keep the last segment.
    const names = listed.value
      .map(entry => entry.slice(entry.lastIndexOf('/') + 1))
      .filter(name => name && !name.endsWith(PART_SUFFIX));
    return new Set(names.map(name => `${dir}/${name}`));
  }
  const there = await logged('exists thumbs', () => exists(dir));
  if (there.ok && !there.value) {
    return new Set();
  }
  log(`thumbs: cannot list ${dir}: ${listed.message}`);
  return null;
}

/**
 * The plugin folder with its stored thumbnails listed, for the grid to read before it renders;
 * null when there is no plugin folder or it cannot be listed (thumbnails then come from the web).
 */
export async function prepareThumbs(): Promise<string | null> {
  const paths = await sessionPaths();
  if (!paths.ok) {
    log(`thumbs: no plugin folder: ${paths.message}`);
    return null;
  }
  if (!known) {
    known = await listThumbs(paths.value.pluginDir);
  }
  return known ? paths.value.pluginDir : null;
}

async function storeOne(
  result: SearchResult,
  pluginDir: string,
): Promise<void> {
  const path = thumbPath(pluginDir, result);
  if (!known || known.has(path) || !result.thumbUrl.startsWith(WEB_PREFIX)) {
    return;
  }
  // shortcut: when the limit is reached, new thumbnails are not stored and the old ones stay;
  // upgrade to oldest-first removal once FileUtils.deleteFile has a src/sdk wrapper.
  if (known.size >= THUMB_LIMIT) {
    log(
      `thumbs: limit of ${THUMB_LIMIT} files reached, ${result.id} not stored`,
    );
    return;
  }
  const saved = await logged(`thumb ${result.id}`, () =>
    downloadToFile(result.thumbUrl, path),
  );
  if (saved.ok) {
    known.add(path);
  }
}

/**
 * Stores the thumbnails of a page that has just been shown, one after another, skipping the
 * ones already stored. Resolves when this page's downloads end; the grid does not wait for it.
 */
export function storeThumbs(
  results: readonly SearchResult[],
  pluginDir: string,
): Promise<void> {
  queue = queue.then(async () => {
    for (const result of results) {
      await storeOne(result, pluginDir);
    }
  });
  return queue;
}

export function resetThumbsForTests(): void {
  known = null;
  queue = Promise.resolve();
}
