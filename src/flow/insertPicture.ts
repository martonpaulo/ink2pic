/**
 * One tap on a result: download it, prepare it for e-ink (#17) into MyStyle/Ink2Pic/library,
 * place it at the lassoed word (#20) or insert it where the host puts it, and record it in the
 * library with its license and attribution (brief sections 7, 8.2, 8.3, 8.6; #12, #14). A library
 * picture is already on the device and is inserted without a download (#15), also when it is
 * picked again from a search (#48).
 */
import {getLibrary, recordInsert} from '../library/device';
import {findItem} from '../library/library';
import {logged, log, TIMEOUT_CODE} from '../log/memory';
import {insertImage} from '../sdk/note';
import {fail, ok, Result} from '../sdk/result';
import {COMMONS_FULL_WIDTH} from '../sources/commons';
import {OPENCLIPART_FULL_WIDTH} from '../sources/openclipart';
import type {SearchResult, SourceName} from '../sources/types';
import {downloadToFile} from '../storage/files';
import {prepareForEink} from '../storage/image';
import {libraryDir, safeFileName} from '../storage/paths';
import {atStep, Done} from './failure';
import {LassoPlace, placeAtLasso} from './place';
import {sessionPaths} from './session';

/** About one third of the 1920 px page (brief section 7): the prepared picture's width. */
export const INSERT_WIDTH = 640;

/** The width each source is asked for: one it serves with no redirect and no upscale (#48). */
const FULL_WIDTH: Record<SourceName, number> = {
  openclipart: OPENCLIPART_FULL_WIDTH,
  commons: COMMONS_FULL_WIDTH,
};

/** The raw download, in the private folder, overwritten by each insert (#48). */
const DOWNLOAD_NAME = 'insert-download';

/** The file extension insertImage accepts (png, jpg, jpeg), from the image URL. */
export function imageExtension(url: string): string {
  const match = /\.(png|jpe?g)(?:$|\?)/i.exec(url);
  return match ? match[1].toLowerCase() : 'png';
}

type Saved = {
  path: string;
  size: {width: number; height: number} | null;
  /** True for a new library file, recorded once the insert succeeds. */
  record: boolean;
};

/**
 * Downloads the picture to the temporary file, then prepares it for e-ink into the library file.
 * When the preparation fails, the downloaded file is inserted as it is, is not recorded, since the
 * next insert overwrites it, and the failure is in the log.
 */
async function download(result: SearchResult): Promise<Result<Saved>> {
  const paths = await sessionPaths();
  if (!paths.ok) {
    return paths;
  }
  const url = result.fullUrl(FULL_WIDTH[result.source]);
  const base = `${libraryDir(paths.value.root)}/${safeFileName(result.id)}`;
  const raw = `${paths.value.pluginDir}/${DOWNLOAD_NAME}.${imageExtension(
    url,
  )}`;
  const bytes = await logged(`downloadToFile(${url} -> ${raw})`, () =>
    downloadToFile(url, raw),
  );
  if (!bytes.ok) {
    return bytes;
  }
  const prepared = await logged(`prepareForEink(${raw})`, () =>
    prepareForEink(raw, `${base}.png`, INSERT_WIDTH),
  );
  return prepared.ok
    ? ok({path: `${base}.png`, size: prepared.value, record: true})
    : ok({path: raw, size: null, record: false});
}

/** A library picture, a search result already in the library, else a download. */
async function picture(result: SearchResult): Promise<Result<Saved>> {
  if (result.localPath) {
    return ok({
      path: result.localPath,
      size: result.localSize ?? null,
      record: false,
    });
  }
  const known = findItem(await getLibrary(), result.id);
  if (known) {
    log(`library: ${result.id} is on the device, no download`);
    const size =
      known.width !== null && known.height !== null
        ? {width: known.width, height: known.height}
        : null;
    return ok({path: known.path, size, record: false});
  }
  return download(result);
}

/** At the lasso when the view opened from the lasso (#20), else where the host puts it. */
async function insertInNote(
  saved: Saved,
  place: LassoPlace | null,
): Promise<Result<unknown>> {
  if (place && saved.size) {
    const placed = await placeAtLasso(saved.path, saved.size, place);
    // After a TIMEOUT the host may still insert it: a fallback could add a second copy (#33).
    if (placed.ok || placed.code === TIMEOUT_CODE) {
      return placed;
    }
  }
  const inserted = await logged(`insertImage(${saved.path})`, () =>
    insertImage(saved.path),
  );
  // `{success: true, result: false}` inserted nothing (#47).
  return inserted.ok && inserted.value !== true
    ? fail(-1, 'insertImage answered false')
    : inserted;
}

export async function insertPicture(
  result: SearchResult,
  query: string,
  place: LassoPlace | null = null,
): Promise<Done<string>> {
  const saved = await picture(result);
  if (!saved.ok) {
    return atStep('download', saved);
  }
  const inserted = await insertInNote(saved.value, place);
  if (!inserted.ok) {
    return atStep('place', inserted);
  }
  if (saved.value.record) {
    await recordInsert({
      id: result.id,
      source: result.source,
      sourceId: result.id.slice(result.id.indexOf(':') + 1),
      sourceUrl: result.fullUrl(FULL_WIDTH[result.source]),
      query,
      license: result.license,
      attribution: result.attribution,
      savedAt: new Date().toISOString(),
      path: saved.value.path,
      width: saved.value.size?.width ?? null,
      height: saved.value.size?.height ?? null,
    });
  }
  return {ok: true, value: saved.value.path};
}
