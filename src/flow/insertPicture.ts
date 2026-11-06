/**
 * One tap on a result: download it into MyStyle/Ink2Pic/library, then insertImage (brief section
 * 8.2 step 6, #12, #14). The host places and sizes the picture; build 0.1.0 (7) measures it (S4).
 */
import {logged} from '../log/memory';
import {getExternalDirPath} from '../sdk/files';
import {insertImage} from '../sdk/note';
import {ok, Result} from '../sdk/result';
import type {SearchResult} from '../sources/types';
import {downloadToFile} from '../storage/files';
import {libraryDir, safeFileName} from '../storage/paths';

/** About one third of the 1920 px page (brief section 7); Commons rounds it to 960. */
export const INSERT_WIDTH = 640;

/** The file extension insertImage accepts (png, jpg, jpeg), from the image URL. */
export function imageExtension(url: string): string {
  const match = /\.(png|jpe?g)(?:$|\?)/i.exec(url);
  return match ? match[1].toLowerCase() : 'png';
}

export async function insertPicture(
  result: SearchResult,
): Promise<Result<string>> {
  const roots = await logged('getExternalDirPath', getExternalDirPath);
  if (!roots.ok) {
    return roots;
  }
  const url = result.fullUrl(INSERT_WIDTH);
  const path = `${libraryDir(roots.value[0])}/${safeFileName(
    result.id,
  )}.${imageExtension(url)}`;
  const bytes = await logged(`downloadToFile(${url} -> ${path})`, () =>
    downloadToFile(url, path),
  );
  if (!bytes.ok) {
    return bytes;
  }
  const inserted = await logged(`insertImage(${path})`, () =>
    insertImage(path),
  );
  return inserted.ok ? ok(path) : inserted;
}
