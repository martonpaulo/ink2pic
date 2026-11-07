/**
 * One tap on a result: download it, prepare it for e-ink (#17) into MyStyle/Ink2Pic/library,
 * place it at the lassoed word (#20) or insert it where the host puts it, and record it in the
 * library with its license and attribution (brief sections 7, 8.2, 8.3, 8.6; #12, #14). A library
 * picture is already on the device and is inserted without a download (#15), also when it is
 * picked again from a search (#48).
 */
import {getLibrary, recordInsert} from '../library/device';
import {findItem} from '../library/library';
import {logged, log, logTime} from '../log/memory';
import {
  deleteLassoElements,
  getLassoRect,
  lassoElements,
  Rect,
} from '../sdk/lasso';
import {getCurrentPageNum} from '../sdk/page';
import {insertImage} from '../sdk/note';
import {fail, ok, Result, THROWN_CODE, TIMEOUT_CODE} from '../sdk/result';
import {insertUrl, SearchResult, sourceId} from '../search-core';
import {deleteFile, downloadToFile} from '../storage/files';
import {prepareForEink} from '../storage/image';
import {
  earlyDownloadPath,
  insertDownloadPath,
  isTemporaryDownload,
  libraryDir,
  safeFileName,
} from '../storage/paths';
import {pluginFolder} from '../storage/session';
import {atStep, Done} from './failure';
import {saveSymbol, symbolFile} from '../symbols/store';
import {SIZE_WIDTHS, styleFlags} from '../settings/settings';
import {getSettings} from '../storage/settings';
import {LassoPlace, placeAtLasso, Placement} from './place';

/** About one third of the 1920 px page (brief section 7): the default prepared width. */
export const INSERT_WIDTH = SIZE_WIDTHS.medium;

/** Why an insert must stop before the note is written, or null to go on (#96). */
export type Stop = () => string | null;

/** What the person chose in Settings for an insert (#70). */
export type InsertOptions = {
  /** The prepared picture's width in page pixels. */
  width: number;
  placement: Placement;
  /** «All contour»: every picture is inserted as a contour drawing. */
  contour: boolean;
};

async function savedOptions(): Promise<InsertOptions> {
  const settings = await getSettings();
  return {
    width: SIZE_WIDTHS[settings.size],
    placement: settings.placement,
    contour: styleFlags(settings).contour,
  };
}

/**
 * The options of «Insert best picture»: it never deletes the handwriting (#106), so «In place of
 * word» places the picture below it. Only a picture chosen in the grid replaces the word.
 */
export async function wordKeptOptions(): Promise<InsertOptions> {
  const options = await savedOptions();
  return options.placement === 'replace'
    ? {...options, placement: 'below'}
    : options;
}

/**
 * The size the picture is placed at: no wider than the chosen width, keeping its proportions. A
 * library picture saved at a larger size shrinks; one saved smaller is never enlarged.
 */
export function placedSize(
  size: {width: number; height: number},
  width: number,
): {width: number; height: number} {
  if (size.width <= width) {
    return size;
  }
  return {width, height: Math.round((size.height * width) / size.width)};
}

/** The file extension insertImage accepts (png, jpg, jpeg), from the image URL. */
export function imageExtension(url: string): string {
  const match = /\.(png|jpe?g)(?:$|\?)/i.exec(url);
  return match ? match[1].toLowerCase() : 'png';
}

/**
 * A full-size download started for the leading picture while page 1 is still measured (#88).
 * `raw` is the downloaded file, or null when the picture needs no download. The module cannot
 * stop a download: one for a picture that did not win is dropped, and the winner's download
 * waits behind it on the module's one download thread.
 */
export type EarlyDownload = {
  id: string;
  started: number;
  raw: Promise<Result<string> | null>;
};

/**
 * Removes a temporary download once the insert no longer needs it (#93), so the private folder
 * does not grow by one file per picture; any other path is left alone. A failure is only logged.
 */
async function removeTemporary(pluginDir: string, path: string): Promise<void> {
  if (!isTemporaryDownload(pluginDir, path)) {
    return;
  }
  const removed = await logged(`deleteFile(${path})`, () => deleteFile(path));
  if (removed.ok && removed.value !== true) {
    log(`deleteFile answered false: ${path} stays`);
  }
}

/** Removes a dropped early download's file once its download ends (#93). Never rejects. */
export function dropEarly(early: EarlyDownload): void {
  early.raw
    .then(async raw => {
      const dir = await pluginFolder();
      if (raw?.ok && dir.ok) {
        await removeTemporary(dir.value, raw.value);
      }
    })
    .catch(error => log(`early download ${early.id}: ${String(error)}`));
}

/**
 * Starts the leading picture's download before it is known to win (#88). Never rejects. A
 * library file is reused only in the style «All contour» asks for (#103): the tile's own style
 * is not known yet, and a download it does not need is dropped.
 */
export function startEarlyDownload(result: SearchResult): EarlyDownload {
  const started = Date.now();
  const raw = (async (): Promise<Result<string> | null> => {
    if (result.localPath) {
      return null;
    }
    const {contour} = await savedOptions();
    if (findItem(await getLibrary(), result.id, contour)) {
      return null;
    }
    const dir = await pluginFolder();
    if (!dir.ok) {
      return dir;
    }
    const url = insertUrl(result);
    const path = earlyDownloadPath(dir.value, result.id, imageExtension(url));
    const bytes = await logged(`downloadToFile(${url} -> ${path}, early)`, () =>
      downloadToFile(url, path),
    );
    if (!bytes.ok) {
      // A download cut off midway may leave part of the file (#91).
      await removeTemporary(dir.value, path);
      return bytes;
    }
    return ok(path);
  })().catch(error => fail(THROWN_CODE, String(error)));
  return {id: result.id, started, raw};
}

/** The early download's file when it is this picture's and it worked; else null, logged. */
async function earlyFile(
  result: SearchResult,
  early: EarlyDownload | null,
): Promise<string | null> {
  if (!early || early.id !== result.id) {
    return null;
  }
  const waited = Date.now();
  const raw = await early.raw;
  if (raw?.ok) {
    logTime(
      'download',
      waited,
      `early, started ${waited - early.started} ms before`,
    );
    return raw.value;
  }
  log(`early download ${result.id}: ${raw ? raw.message : 'none'}`);
  return null;
}

type Saved = {
  path: string;
  size: {width: number; height: number} | null;
  /** True for a new library file, recorded once the insert succeeds. */
  record: boolean;
  /** True when the file is a contour drawing; an unprepared fallback never is (#103). */
  contour: boolean;
};

/** The contour drawing's library file has its own name: a plain file never changes style (#103). */
const CONTOUR_NAME = '.contour';
/**
 * The name the unprepared picture is kept under when the preparation fails. Never the prepared
 * file's: after a TIMEOUT the image module may still be writing that one (#103).
 */
const ORIGINAL_NAME = '.original';

/**
 * Downloads the picture to the private temporary file, then prepares it for e-ink into the library
 * file, as a contour drawing when `contour` (#66). When the preparation fails, the picture is
 * downloaded again straight into the library under its own name, because the note app may not
 * read the private folder (brief section 6.6), and it is recorded like a prepared one; the
 * failure is in the log (#62).
 */
async function download(
  result: SearchResult,
  contour: boolean,
  width: number,
  early: EarlyDownload | null,
): Promise<Result<Saved>> {
  const url = insertUrl(result);
  const base = `${libraryDir()}/${safeFileName(result.id)}`;
  const preparedPath = `${base}${contour ? CONTOUR_NAME : ''}.png`;
  const dir = await pluginFolder();
  if (!dir.ok) {
    return dir;
  }
  // A saved OpenMoji symbol needs no download (#91).
  let raw = (await symbolFile(result)) ?? (await earlyFile(result, early));
  if (!raw) {
    raw = insertDownloadPath(dir.value, result.id, imageExtension(url));
    const path = raw;
    const at = Date.now();
    const bytes = await logged(`downloadToFile(${url} -> ${path})`, () =>
      downloadToFile(url, path),
    );
    logTime('download', at);
    if (!bytes.ok) {
      await removeTemporary(dir.value, path);
      return bytes;
    }
  }
  const from = raw;
  const at = Date.now();
  const prepared = await logged(
    `prepareForEink(${raw}${contour ? ', contour' : ''})`,
    () => prepareForEink(from, preparedPath, width, 'png', contour),
  );
  logTime('conversion', at);
  // The prepared or downloaded-again library file is the one kept (#93).
  await removeTemporary(dir.value, from);
  if (prepared.ok) {
    return ok({
      path: preparedPath,
      size: prepared.value,
      record: true,
      contour,
    });
  }
  const kept = `${base}${ORIGINAL_NAME}.${imageExtension(url)}`;
  const again = await logged(`downloadToFile(${url} -> ${kept})`, () =>
    downloadToFile(url, kept),
  );
  return again.ok
    ? ok({path: kept, size: null, record: true, contour: false})
    : again;
}

/** A library picture, a search result already in the library, else a download. */
async function picture(
  result: SearchResult,
  contour: boolean,
  width: number,
  early: EarlyDownload | null,
): Promise<Result<Saved>> {
  if (result.localPath) {
    return ok({
      path: result.localPath,
      size: result.localSize ?? null,
      record: false,
      contour: false,
    });
  }
  const known = findItem(await getLibrary(), result.id, contour);
  if (known) {
    log(
      `library: ${result.id}${
        contour ? ' (contour)' : ''
      } is on the device, no download`,
    );
    const size =
      known.width !== null && known.height !== null
        ? {width: known.width, height: known.height}
        : null;
    return ok({path: known.path, size, record: false, contour});
  }
  return download(result, contour, width, early);
}

/**
 * At the lasso when the view opened from the lasso (#20), else where the host puts it. The value
 * is the placed rect, or null when the host placed it: insertImage gives no rect.
 */
async function insertInNote(
  saved: Saved,
  place: LassoPlace | null,
  options: InsertOptions,
): Promise<Result<Rect | null>> {
  if (place && saved.size) {
    const placed = await placeAtLasso(
      saved.path,
      placedSize(saved.size, options.width),
      place,
      options.placement,
    );
    // After a TIMEOUT the host may still insert it: a fallback could add a second copy (#33).
    if (placed.ok || placed.code === TIMEOUT_CODE) {
      return placed;
    }
  }
  const inserted = await logged(`insertImage(${saved.path})`, () =>
    insertImage(saved.path),
  );
  // `{success: true, result: false}` inserted nothing (#47).
  if (!inserted.ok) {
    return inserted;
  }
  return inserted.value === true
    ? ok(null)
    : fail(THROWN_CODE, 'insertImage answered false');
}

function sameRect(a: Rect, b: Rect): boolean {
  return (
    a.left === b.left &&
    a.top === b.top &&
    a.right === b.right &&
    a.bottom === b.bottom
  );
}

/**
 * Why the note changed since the lasso was read, or null when it did not (#93): the page, and the
 * lasso rect when `rect`. A place without `recheck` comes from the view, which covers the note.
 */
async function noteChanged(
  place: LassoPlace | null,
  rect: boolean,
): Promise<string | null> {
  if (!place?.recheck) {
    return null;
  }
  const page = await logged('getCurrentPageNum', getCurrentPageNum);
  if (!page.ok) {
    return `the page cannot be read: ${page.message}`;
  }
  if (page.value !== place.page) {
    return `the page changed from ${place.page} to ${page.value}`;
  }
  if (!rect) {
    return null;
  }
  const lasso = await logged('getLassoRect', getLassoRect);
  if (!lasso.ok) {
    return `the lasso cannot be read: ${lasso.message}`;
  }
  return sameRect(lasso.value, place.rect)
    ? null
    : `the lasso changed from ${JSON.stringify(place.rect)} to ${JSON.stringify(
        lasso.value,
      )}`;
}

/**
 * Leaves the placed picture lassoed, ready to move or resize (#73), while the view is still open:
 * the lasso the view opened with survives the view (brief section 10.5, TO TEST that this one
 * does too). With no view, only on the page the lasso was read on, and, unless the word was just
 * deleted, while the lasso is still the one read (#93). A failure is only logged: the picture
 * stays inserted.
 */
async function lassoPlaced(
  rect: Rect | null,
  place: LassoPlace | null,
  wordDeleted: boolean,
): Promise<void> {
  if (!rect) {
    // insertImage shows the picture as the host's own floating selection (brief section 10.5).
    log('lassoElements: skipped, the host placed the picture and gave no rect');
    return;
  }
  // A delete ends the lasso by design: then only the page is compared.
  const changed = await noteChanged(place, !wordDeleted);
  if (changed) {
    log(`lassoElements: skipped, ${changed}`);
    return;
  }
  const lassoed = await logged(`lassoElements(${JSON.stringify(rect)})`, () =>
    lassoElements(rect),
  );
  if (lassoed.ok && lassoed.value !== true) {
    log('lassoElements answered false: the picture is not lassoed');
  }
}

/**
 * «In place of the word» (#70): the lassoed handwriting is deleted only after the picture was
 * placed at the word, on the person's own tap with that setting on; logged. Whether the lasso
 * still holds the word after the insert is TO TEST on the device. With no view, only while the
 * page and the lasso rect are the ones read at the start (#93). A failure keeps the word. True
 * when the word was deleted.
 */
async function deleteWord(
  rect: Rect | null,
  place: LassoPlace | null,
): Promise<boolean> {
  if (!rect) {
    log('deleteLassoElements: skipped, the picture is not at the word');
    return false;
  }
  const changed = await noteChanged(place, true);
  if (changed) {
    log(`deleteLassoElements: skipped, ${changed}; the strokes stay`);
    return false;
  }
  const deleted = await logged(
    'deleteLassoElements (in place of the word)',
    () => deleteLassoElements(),
  );
  if (deleted.ok && deleted.value !== true) {
    log('deleteLassoElements answered false: the word stays');
  }
  return deleted.ok && deleted.value === true;
}

export async function insertPicture(
  result: SearchResult,
  query: string,
  place: LassoPlace | null = null,
  contour = false,
  options?: InsertOptions,
  early: EarlyDownload | null = null,
  /**
   * Why the insert must stop, or null to go on: read once the picture is ready, before the note
   * is written, so a Close or a passed limit writes nothing (#93, #96). The one host write itself
   * cannot be stopped.
   */
  stop: Stop = () => null,
): Promise<Done<string>> {
  const chosen = options ?? (await savedOptions());
  const saved = await picture(
    result,
    contour || chosen.contour,
    chosen.width,
    early,
  );
  if (!saved.ok) {
    return atStep('download', saved);
  }
  const reason = stop();
  if (reason) {
    log(`insert ${result.id}: stopped before the note was written: ${reason}`);
    return atStep('download', fail(THROWN_CODE, `stopped: ${reason}`));
  }
  let at = Date.now();
  const inserted = await insertInNote(saved.value, place, chosen);
  logTime('insert', at);
  if (!inserted.ok) {
    return atStep('place', inserted);
  }
  let wordDeleted = false;
  if (place && chosen.placement === 'replace') {
    at = Date.now();
    wordDeleted = await deleteWord(inserted.value, place);
    logTime('word delete', at);
  }
  at = Date.now();
  await lassoPlaced(inserted.value, place, wordDeleted);
  logTime('lasso', at);
  if (saved.value.record) {
    at = Date.now();
    await recordInsert({
      id: result.id,
      source: result.source,
      sourceId: sourceId(result.id),
      sourceUrl: insertUrl(result),
      query,
      license: result.license,
      attribution: result.attribution,
      savedAt: new Date().toISOString(),
      path: saved.value.path,
      width: saved.value.size?.width ?? null,
      height: saved.value.size?.height ?? null,
      contour: saved.value.contour,
    });
    logTime('write', at);
  }
  // A symbol inserted is kept for offline use; a no-op when the grid saved it already (#91).
  await saveSymbol(result);
  return {ok: true, value: saved.value.path};
}
