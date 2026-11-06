/**
 * One tap on a result: download it into MyStyle/Ink2Pic/library, insertImage, and record it in
 * the library with its license and attribution (brief sections 8.2 step 6 and 8.6; #12, #14).
 * A library picture is already on the device and is inserted without a download (#15).
 */
import {recordInsert} from '../library/device';
import {logged} from '../log/memory';
import {insertImage} from '../sdk/note';
import {ok, Result} from '../sdk/result';
import type {SearchResult} from '../sources/types';
import {downloadToFile} from '../storage/files';
import {libraryDir, safeFileName} from '../storage/paths';
import {sessionPaths} from './session';

/** About one third of the 1920 px page (brief section 7); Commons rounds it to 960. */
export const INSERT_WIDTH = 640;

/** The file extension insertImage accepts (png, jpg, jpeg), from the image URL. */
export function imageExtension(url: string): string {
  const match = /\.(png|jpe?g)(?:$|\?)/i.exec(url);
  return match ? match[1].toLowerCase() : 'png';
}

async function download(result: SearchResult): Promise<Result<string>> {
  const paths = await sessionPaths();
  if (!paths.ok) {
    return paths;
  }
  const url = result.fullUrl(INSERT_WIDTH);
  const path = `${libraryDir(paths.value.root)}/${safeFileName(
    result.id,
  )}.${imageExtension(url)}`;
  const bytes = await logged(`downloadToFile(${url} -> ${path})`, () =>
    downloadToFile(url, path),
  );
  return bytes.ok ? ok(path) : bytes;
}

export async function insertPicture(
  result: SearchResult,
  query: string,
): Promise<Result<string>> {
  const file = result.localPath ? ok(result.localPath) : await download(result);
  if (!file.ok) {
    return file;
  }
  const inserted = await logged(`insertImage(${file.value})`, () =>
    insertImage(file.value),
  );
  if (!inserted.ok) {
    return inserted;
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
      path: file.value,
      width: INSERT_WIDTH,
      height: null,
    });
  }
  return ok(file.value);
}
