/**
 * Downloads and small text files through the plugin's own Java module, Ink2PicFiles (#11):
 * sn-plugin-lib 0.2.3 and PluginHost have no file writer (brief sections 4.2 and 6).
 */
import {NativeModules} from 'react-native';
import {USER_AGENT} from '../config';
import {fail, ok, Result} from '../sdk/result';

/** The module's rejection codes, plus MISSING when PluginHost did not load it. */
export type FilesErrorCode =
  | 'HTTPS_ONLY'
  | 'BAD_PATH'
  | 'TOO_LARGE'
  | 'IO'
  | 'MISSING'
  | string;

type NativeFiles = {
  downloadToFile: (
    url: string,
    destPath: string,
    headers: Record<string, string>,
  ) => Promise<number>;
  writeText: (path: string, text: string) => Promise<null>;
  readText: (path: string) => Promise<string | null>;
  listDir: (path: string) => Promise<string[] | null>;
};

/** Distinct from the SDK's numeric codes: the module rejects with a text code. */
const MODULE_CODE = -2;

/**
 * Calls one of the plugin's own native modules and maps a rejection to a Failure that keeps the
 * module's text code; MISSING when PluginHost did not load the module.
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
    );
  }
  try {
    return ok(await run(native));
  } catch (error) {
    const code = (error as {code?: string}).code ?? 'IO';
    const message = error instanceof Error ? error.message : String(error);
    return fail(MODULE_CODE, `${code}: ${message}`);
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

export function writeText(path: string, text: string): Promise<Result<null>> {
  return call(files => files.writeText(path, text));
}

/** `null` when the file does not exist. */
export function readText(path: string): Promise<Result<string | null>> {
  return call(files => files.readText(path));
}

/** The names in a folder, or null when it does not exist; through the plugin's own module (#13). */
export function listDir(path: string): Promise<Result<string[] | null>> {
  return call(files => files.listDir(path));
}
