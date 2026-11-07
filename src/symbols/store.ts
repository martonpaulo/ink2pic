/**
 * OpenMoji pictures kept on the device for offline use (#91): each symbol shown or inserted is
 * saved once as `MyStyle/Ink2Pic/symbols/<hex>.png`, and Settings can download every one. Shared
 * storage is written in place by the plugin's own module (#62). Nothing here deletes a file:
 * PluginHost counts a delete in shared storage as FILE:DELETE, which Ink2Pic does not declare.
 */
import {log, logged} from '../log/memory';
import {
  networkDown,
  openmojiPictureUrl,
  SearchOutcome,
  SearchResult,
  sourceId,
  symbolHexes,
} from '../search-core';
import {
  downloadThumbToFile,
  isCompletePng,
  listCompletePngs,
} from '../storage/files';
import {symbolsDir} from '../storage/paths';

const EXTENSION = '.png';
const FILE_PREFIX = 'file://';
/** Requests at a time for «Download symbols»: polite to raw.githubusercontent.com. */
export const DOWNLOAD_PARALLEL = 3;
/** 1,447 PNGs at 618 px measured about 15 MB (#91): 10.4 KB each on average. */
export const SYMBOL_BYTES = 10400;
const BYTES_PER_MB = 1000 * 1000;

/** The saved symbols' codes; null until the folder is listed. */
let saved: Set<string> | null = null;
let listing: Promise<Set<string>> | null = null;
/** One download per symbol: a second request for the same one joins the first. */
const pending = new Map<string, Promise<boolean>>();

export function symbolPath(hex: string): string {
  return `${symbolsDir()}/${hex}${EXTENSION}`;
}

function isSymbol(result: SearchResult): boolean {
  return result.source === 'openmoji';
}

/**
 * The saved symbols, listed once per session: whole PNGs only, never one a cut-off download
 * left (#91). A folder that cannot be listed counts as empty:
 * pictures then come from the network, as before.
 */
export function savedSymbols(): Promise<Set<string>> {
  if (saved) {
    return Promise.resolve(saved);
  }
  listing ??= logged('listCompletePngs symbols', () =>
    listCompletePngs(symbolsDir()),
  ).then(listed => {
    if (!listed.ok) {
      log(`symbols: cannot list ${symbolsDir()}: ${listed.message}`);
    }
    const names = listed.ok ? listed.value ?? [] : [];
    saved = new Set(
      names
        .filter(name => name.endsWith(EXTENSION))
        .map(name => name.slice(0, -EXTENSION.length)),
    );
    return saved;
  });
  return listing;
}

/** The saved picture of an OpenMoji result, known from this session's listing; else null. */
export function savedSymbolPath(result: SearchResult): string | null {
  const hex = sourceId(result.id);
  return isSymbol(result) && saved?.has(hex) ? symbolPath(hex) : null;
}

/** As `savedSymbolPath`, listing the folder first when this session has not. */
export async function symbolFile(result: SearchResult): Promise<string | null> {
  if (!isSymbol(result)) {
    return null;
  }
  await savedSymbols();
  return savedSymbolPath(result);
}

/**
 * Downloads one symbol into the folder unless it is there; true when it is saved afterwards. In
 * the background lane, so an insert never waits behind it (#46). A download cut off midway leaves
 * a partial file in place, which is never counted: the file must end with the PNG's IEND chunk,
 * checked here and again by each session's listing; the next save writes over it.
 */
function save(hex: string): Promise<boolean> {
  const running = pending.get(hex);
  if (running) {
    return running;
  }
  const started = (async () => {
    const known = await savedSymbols();
    if (known.has(hex)) {
      return true;
    }
    const path = symbolPath(hex);
    const bytes = await logged(`symbol ${hex}`, () =>
      downloadThumbToFile(openmojiPictureUrl(hex), path),
    );
    if (!bytes.ok) {
      return false;
    }
    const whole = await logged(`isCompletePng ${hex}`, () =>
      isCompletePng(path),
    );
    if (!whole.ok || !whole.value) {
      log(`symbols: ${hex} is not a whole PNG; not saved`);
      return false;
    }
    known.add(hex);
    return true;
  })().finally(() => pending.delete(hex));
  pending.set(hex, started);
  return started;
}

/** Saves an OpenMoji result's picture once, after it was shown or inserted. Never rejects. */
export async function saveSymbol(result: SearchResult): Promise<void> {
  if (isSymbol(result)) {
    await save(sourceId(result.id)).catch(error =>
      log(`symbols: save ${result.id} failed: ${String(error)}`),
    );
  }
}

/**
 * The grid's picture of an OpenMoji result: the saved file, downloaded into the folder first when
 * missing; the web URL when that failed.
 */
export async function symbolUri(result: SearchResult): Promise<string> {
  const hex = sourceId(result.id);
  return (await save(hex).catch(() => false))
    ? `${FILE_PREFIX}${symbolPath(hex)}`
    : result.thumbUrl;
}

/**
 * Marks each OpenMoji result whose picture is saved with `offlinePicture`; with no network, drops
 * the OpenMoji results without it, whose pictures cannot show (#91).
 */
export async function markSavedSymbols(
  outcome: SearchOutcome,
): Promise<SearchOutcome> {
  if (!outcome.results.some(isSymbol)) {
    return outcome;
  }
  await savedSymbols();
  const marked = outcome.results.map(result =>
    savedSymbolPath(result)
      ? {...result, offlinePicture: true as const}
      : result,
  );
  const offline = networkDown(outcome);
  return {
    ...outcome,
    results: offline
      ? marked.filter(result => !isSymbol(result) || result.offlinePicture)
      : marked,
  };
}

/** How many symbols exist and how many are saved, for Settings. */
export type SymbolsStatus = {total: number; saved: number};

export async function symbolsStatus(): Promise<SymbolsStatus> {
  const known = await savedSymbols();
  const all = symbolHexes();
  return {total: all.length, saved: all.filter(hex => known.has(hex)).length};
}

/** The download size of the missing symbols, in whole megabytes, at least 1 when any is missing. */
export function missingMegabytes(status: SymbolsStatus): number {
  const missing = status.total - status.saved;
  return missing > 0
    ? Math.max(1, Math.round((missing * SYMBOL_BYTES) / BYTES_PER_MB))
    : 0;
}

/**
 * Failed downloads in a row, with no symbol saved between them, that stop «Download symbols»: the
 * network is gone, not one symbol. DEFAULT, no device measurement yet.
 */
export const STOP_AFTER_FAILURES = 10;

/**
 * The end of «Download symbols»: `failed` symbols were skipped (#104); `stopped` when
 * `STOP_AFTER_FAILURES` failed in a row and the rest was not tried.
 */
export type SymbolsDownload = SymbolsStatus & {
  complete: boolean;
  failed: number;
  stopped: boolean;
};

/**
 * Downloads every missing symbol, `DOWNLOAD_PARALLEL` at a time, reporting the saved count after
 * each. A symbol that fails is skipped, logged and counted, and the rest go on (#104); after
 * `STOP_AFTER_FAILURES` failures in a row it stops, so no network means a few failed requests, not
 * 1,447. A new run resumes from the files already saved and tries the failed ones again. Never
 * rejects.
 */
export async function downloadAllSymbols(
  onProgress: (status: SymbolsStatus) => void,
): Promise<SymbolsDownload> {
  const known = await savedSymbols();
  const all = symbolHexes();
  const missing = all.filter(hex => !known.has(hex));
  let done = all.length - missing.length;
  const failed: string[] = [];
  let inARow = 0;
  let next = 0;
  log(`symbols: downloading ${missing.length} of ${all.length}`);
  const worker = async () => {
    while (inARow < STOP_AFTER_FAILURES && next < missing.length) {
      const hex = missing[next++];
      if (await save(hex).catch(() => false)) {
        inARow = 0;
        done += 1;
        onProgress({total: all.length, saved: done});
      } else {
        inARow += 1;
        failed.push(hex);
        log(`symbols: ${hex} failed; skipped`);
      }
    }
  };
  await Promise.all(Array.from({length: DOWNLOAD_PARALLEL}, worker));
  const stopped = next < missing.length;
  log(
    `symbols: ${done} of ${all.length} saved, ${failed.length} failed` +
      (stopped ? `, stopped after ${STOP_AFTER_FAILURES} in a row` : ''),
  );
  return {
    total: all.length,
    saved: done,
    complete: done === all.length,
    failed: failed.length,
    stopped,
  };
}

export function resetSymbolsForTests(): void {
  saved = null;
  listing = null;
  pending.clear();
}
