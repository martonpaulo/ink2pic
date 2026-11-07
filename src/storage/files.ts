/**
 * Downloads and small text files through the plugin's own Java module, Ink2PicFiles (#11):
 * sn-plugin-lib 0.2.3 and PluginHost have no file writer (brief sections 4.2 and 6).
 */
import {NativeModules} from 'react-native';
import {USER_AGENT} from '../config';
import {fail, MODULE_CODE, ok, Result} from '../sdk/result';

/**
 * The module's rejection codes, plus MISSING when PluginHost did not load it. IO carries an error
 * Android raised; `HTTP_<status>` a download that was not HTTP 200.
 */
export type FilesErrorCode =
  | 'HTTPS_ONLY'
  | 'BAD_PATH'
  | 'TOO_LARGE'
  | 'IO'
  | 'MISSING'
  | `HTTP_${number}`;

type NativeFiles = {
  downloadToFile: (
    url: string,
    destPath: string,
    headers: Record<string, string>,
  ) => Promise<number>;
  downloadThumbToFile: (
    url: string,
    destPath: string,
    headers: Record<string, string>,
  ) => Promise<number>;
  deleteFile: (path: string) => Promise<boolean>;
  writeText: (path: string, text: string) => Promise<null>;
  readText: (path: string) => Promise<string | null>;
  listDir: (path: string) => Promise<string[] | null>;
  listCompletePngs: (path: string) => Promise<string[] | null>;
  isCompletePng: (path: string) => Promise<boolean>;
};

/**
 * Calls one of the plugin's own native modules and maps a rejection to a CallFailure that keeps the
 * module's text code in `moduleCode`, and in the message for the log; MISSING when PluginHost did
 * not load the module.
 */
export async function callModule<M, T>(
  name: string,
  run: (native: M) => Promise<T>,
): Promise<Result<T>> {
  const native = (NativeModules[name] as M | undefined) ?? null;
  if (!native) {
    return fail(
      MODULE_CODE,
      `MISSING: ${name} is not loaded; check reactPackages in PluginConfig.json`,
      'MISSING',
    );
  }
  try {
    return ok(await run(native));
  } catch (error) {
    const code = (error as {code?: string}).code ?? 'IO';
    const message = error instanceof Error ? error.message : String(error);
    return fail(MODULE_CODE, `${code}: ${message}`, code);
  }
}

function call<T>(run: (files: NativeFiles) => Promise<T>): Promise<Result<T>> {
  return callModule('Ink2PicFiles', run);
}

/** Downloads `url` to `destPath` with the plugin's User-Agent; resolves the byte count. */
export function downloadToFile(
  url: string,
  destPath: string,
): Promise<Result<number>> {
  return call(files =>
    files.downloadToFile(url, destPath, {'User-Agent': USER_AGENT}),
  );
}

/**
 * A grid thumbnail, in the background: the module starts it only when no `downloadToFile` runs,
 * so the person's insert never waits behind thumbnails (#46).
 */
export function downloadThumbToFile(
  url: string,
  destPath: string,
): Promise<Result<number>> {
  return call(files =>
    files.downloadThumbToFile(url, destPath, {'User-Agent': USER_AGENT}),
  );
}

/** True when the file is gone afterwards, also when it never existed. */
export function deleteFile(path: string): Promise<Result<boolean>> {
  return call(files => files.deleteFile(path));
}

export function writeText(path: string, text: string): Promise<Result<null>> {
  return call(files => files.writeText(path, text));
}

/** `null` when the file does not exist. */
export function readText(path: string): Promise<Result<string | null>> {
  return call(files => files.readText(path));
}

/**
 * The names in a folder, oldest modified first, or null when it does not exist; through the
 * plugin's own module (#13).
 */
export function listDir(path: string): Promise<Result<string[] | null>> {
  return call(files => files.listDir(path));
}

/**
 * The whole `.png` files of a folder (they end with the IEND chunk), or null when it does not
 * exist: a download cut off midway is left out (#91).
 */
export function listCompletePngs(
  path: string,
): Promise<Result<string[] | null>> {
  return call(files => files.listCompletePngs(path));
}

/** True when the file is a whole PNG (#91). */
export function isCompletePng(path: string): Promise<Result<boolean>> {
  return call(files => files.isCompletePng(path));
}
