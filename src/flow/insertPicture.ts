/**
 * One tap on a result: download it, prepare it for e-ink (#17) into MyStyle/Ink2Pic/library,
 * place it at the lassoed word (#20) or insert it where the host puts it, and record it in the
 * library with its license and attribution (brief sections 7, 8.2, 8.3, 8.6; #12, #14). A library
 * picture is already on the device and is inserted without a download (#15).
 */
import {recordInsert} from '../library/device';
import {logged, TIMEOUT_CODE} from '../log/memory';
import {insertImage} from '../sdk/note';
import {ok, Result} from '../sdk/result';
import type {SearchResult} from '../sources/types';
import {downloadToFile} from '../storage/files';
import {prepareForEink} from '../storage/image';
import {libraryDir, safeFileName} from '../storage/paths';
import {atStep, Done} from './failure';
import {LassoPlace, placeAtLasso} from './place';
import {sessionPaths} from './session';

/** About one third of the 1920 px page (brief section 7); Commons rounds it to 960. */
export const INSERT_WIDTH = 640;

/** The file extension insertImage accepts (png, jpg, jpeg), from the image URL. */
export function imageExtension(url: string): string {
  const match = /\.(png|jpe?g)(?:$|\?)/i.exec(url);
  return match ? match[1].toLowerCase() : 'png';
}

type Saved = {path: string; size: {width: number; height: number} | null};

/**
 * Downloads the picture, then prepares it for e-ink into the library file. When the preparation
 * fails, the downloaded file is used as it is, and the failure is in the log.
 */
async function download(result: SearchResult): Promise<Result<Saved>> {
  const paths = await sessionPaths();
  if (!paths.ok) {
    return paths;
  }
  const url = result.fullUrl(INSERT_WIDTH);
  const base = `${libraryDir(paths.value.root)}/${safeFileName(result.id)}`;
  const raw = `${base}.source.${imageExtension(url)}`;
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
    ? ok({path: `${base}.png`, size: prepared.value})
    : ok({path: raw, size: null});
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
  return logged(`insertImage(${saved.path})`, () => insertImage(saved.path));
}

export async function insertPicture(
  result: SearchResult,
  query: string,
  place: LassoPlace | null = null,
): Promise<Done<string>> {
  const saved: Result<Saved> = result.localPath
    ? ok({path: result.localPath, size: result.localSize ?? null})
    : await download(result);
  if (!saved.ok) {
    return atStep('download', saved);
  }
  const inserted = await insertInNote(saved.value, place);
  if (!inserted.ok) {
    return atStep('place', inserted);
  }
  if (!result.localPath) {
    await recordInsert({
      id: result.id,
      source: result.source,
      sourceId: result.id.slice(result.id.indexOf(':') + 1),
      sourceUrl: result.fullUrl(INSERT_WIDTH),
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
