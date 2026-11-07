/**
 * Thumbnails kept as files in the private plugin folder (#16, brief section 8.5), so a page seen
 * before opens from the device. A new page downloads each missing thumbnail once to its file and
 * the grid renders the file (#46): before, the grid loaded the web URL and the file was
 * downloaded again afterwards, two requests per thumbnail.
 */
import {log, logged} from '../log/memory';
import {deleteFile, downloadThumbToFile, listDir} from '../storage/files';
import {safeFileName} from '../storage/paths';
import {pluginFolder} from '../storage/session';
import type {SearchResult} from '../search-core';
import {savedSymbolPath, symbolUri} from '../symbols/store';

/** Most thumbnail files kept; the oldest is removed first. DEFAULT: about 100 KB each, 30 MB. */
export const THUMB_LIMIT = 300;
/**
 * A page shows at the latest after this, without its unanswered thumbnails (#24, #64); the
 * measures of pages 1 and 2 take at most as long (`MEASURE_LIMIT_MS`).
 * shortcut: each round of replacements gets its own wait, so a server that never answers costs
 * one wait per round; bound the total if a device report shows a page waiting that long.
 */
export const THUMB_TIMEOUT_MS = 8000;
const THUMB_DIR = 'thumbs';
const WEB_PREFIX = 'https://';
const FILE_PREFIX = 'file://';
/** The Java module writes `<name>.part` and renames it into place when complete. */
const PART_SUFFIX = '.part';
/**
 * A thumbnail shown as its contour drawing: `thumbs/<id>.contour.png`, from thumbPath, in the
 * private folder for every result, a saved symbol's too, never beside a shared file, which
 * cannot be deleted (#72, #103).
 */
export const CONTOUR_SUFFIX = '.contour.png';
/**
 * A faint thumbnail shown darkened: `thumbs/<id>.dark.png` (#81, #103); not a contour drawing, so
 * it inserts darkened too.
 */
export const DARKENED_SUFFIX = '.dark.png';
/** The converted files a thumbnail can have, removed with it (#102). */
const SIBLING_SUFFIXES = [CONTOUR_SUFFIX, DARKENED_SUFFIX];

/** The thumbnail a converted file belongs to, or null for a thumbnail itself. */
function ownerOf(path: string): string | null {
  const suffix = SIBLING_SUFFIXES.find(end => path.endsWith(end));
  return suffix ? path.slice(0, -suffix.length) : null;
}

/**
 * Full paths of the thumbnail files on the device, oldest first (the module lists them by age,
 * and a Set keeps insertion order); null until the folder is listed.
 */
let known: Set<string> | null = null;
/** One download per thumbnail: a second request for the same file joins the first. */
const pending = new Map<string, Promise<string>>();

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
  const symbol = savedSymbolPath(result);
  if (symbol) {
    return `${FILE_PREFIX}${symbol}`;
  }
  const path = thumbPath(pluginDir, result);
  return stored(path) ? `${FILE_PREFIX}${path}` : result.thumbUrl;
}

/**
 * The web URL to try once when the stored file `uri` could not be shown (Fresco cannot read the
 * file, or it was incomplete), else null: a library file has no web copy (#46).
 */
export function webRetryUri(result: SearchResult, uri: string): string | null {
  return uri.startsWith(FILE_PREFIX) && result.thumbUrl.startsWith(WEB_PREFIX)
    ? result.thumbUrl
    : null;
}

/** True when the grid must call `thumbUri` before it can render this thumbnail. */
export function needsDownload(
  result: SearchResult,
  pluginDir: string,
): boolean {
  return (
    known !== null &&
    result.thumbUrl.startsWith(WEB_PREFIX) &&
    !savedSymbolPath(result) &&
    !known.has(thumbPath(pluginDir, result))
  );
}

/**
 * Lists the stored thumbnails once per session; an unreadable folder turns the cache off. A
 * converted file counts on its own when its thumbnail is not stored (a saved symbol's, or one
 * whose thumbnail was removed), so the oldest go first; the others leave with their thumbnail
 * (#102).
 */
async function listThumbs(pluginDir: string): Promise<Set<string> | null> {
  const dir = thumbDir(pluginDir);
  const listed = await logged('listDir thumbs', () => listDir(dir));
  if (listed.ok) {
    const paths = (listed.value ?? [])
      .filter(name => name && !name.endsWith(PART_SUFFIX))
      .map(name => `${dir}/${name}`);
    const all = new Set(paths);
    return new Set(
      paths.filter(path => {
        const owner = ownerOf(path);
        return owner === null || !all.has(owner);
      }),
    );
  }
  log(`thumbs: cannot list ${dir}: ${listed.message}`);
  return null;
}

/**
 * The plugin folder with its stored thumbnails listed, for the grid to read before it renders;
 * null when there is no plugin folder or it cannot be listed (thumbnails then come from the web).
 */
export async function prepareThumbs(): Promise<string | null> {
  const dir = await pluginFolder();
  if (!dir.ok) {
    log(`thumbs: no plugin folder: ${dir.message}`);
    return null;
  }
  if (!known) {
    known = await listThumbs(dir.value);
  }
  return known ? dir.value : null;
}

/**
 * Counts a converted file just written (#102): on its own when its thumbnail is not stored, as
 * for a saved symbol, whose picture lives in the symbols folder; else it leaves with its thumbnail.
 */
export function storeDerived(path: string): void {
  const owner = ownerOf(path);
  if (known && owner !== null && !known.has(owner)) {
    known.delete(path);
    known.add(path);
  }
}

/** Downloads started and not ended: each holds a place in the store while it runs. */
let reserved = 0;

/** Removes one stored file and its converted files; false when one is still on the device. */
async function remove(path: string): Promise<boolean> {
  const siblings =
    ownerOf(path) === null ? SIBLING_SUFFIXES.map(end => `${path}${end}`) : [];
  for (const file of [path, ...siblings]) {
    const removed = await logged(`delete thumb ${file}`, () =>
      deleteFile(file),
    );
    if (!removed.ok || !removed.value) {
      return false;
    }
  }
  return true;
}

/**
 * Removes the oldest files, each with its converted files, until the running downloads fit;
 * false when a file cannot be removed. Each file leaves the list before its delete is awaited,
 * so parallel downloads remove different files.
 */
async function makeRoom(stored: Set<string>): Promise<boolean> {
  while (stored.size + reserved > THUMB_LIMIT) {
    const oldest = stored.values().next().value;
    if (oldest === undefined) {
      return false;
    }
    stored.delete(oldest);
    if (!(await remove(oldest))) {
      // Still on the device, so it is counted again, now as the newest.
      stored.add(oldest);
      return false;
    }
  }
  return true;
}

async function download(
  result: SearchResult,
  path: string,
  stored: Set<string>,
): Promise<string> {
  reserved += 1;
  try {
    if (!(await makeRoom(stored))) {
      log(`thumbs: store full, ${result.id} loads from the web`);
      return result.thumbUrl;
    }
    const saved = await logged(`thumb ${result.id}`, () =>
      downloadThumbToFile(result.thumbUrl, path),
    );
    if (!saved.ok) {
      // The web URL gets one more try in the grid; the failure is already logged.
      return result.thumbUrl;
    }
    if (saved.value === 0) {
      // An empty answer is no picture: Openclipart image/400px/2370 answers 200 with no body.
      // The file is removed and never counted as stored; the grid's web retry fails it (#65).
      log(`thumbs: ${result.id} downloaded empty; not stored`);
      await logged(`delete thumb ${path}`, () => deleteFile(path));
      return result.thumbUrl;
    }
    stored.add(path);
    return `${FILE_PREFIX}${path}`;
  } finally {
    reserved -= 1;
  }
}

/**
 * The URI the grid renders: the stored file, downloaded first when it is missing, once per
 * thumbnail. The web URL when the store is off, for a library file, or when the download failed.
 */
export function thumbUri(
  result: SearchResult,
  pluginDir: string,
): Promise<string> {
  const stored = known;
  if (!stored || !result.thumbUrl.startsWith(WEB_PREFIX)) {
    return Promise.resolve(result.thumbUrl);
  }
  if (result.source === 'openmoji') {
    // Kept in the symbols folder for offline use, not in the thumbnail store (#91).
    return symbolUri(result);
  }
  const path = thumbPath(pluginDir, result);
  if (stored.has(path)) {
    return Promise.resolve(`${FILE_PREFIX}${path}`);
  }
  const running = pending.get(path);
  if (running) {
    return running;
  }
  const started = download(result, path, stored).finally(() =>
    pending.delete(path),
  );
  pending.set(path, started);
  return started;
}

export function resetThumbsForTests(): void {
  known = null;
  pending.clear();
  reserved = 0;
}
