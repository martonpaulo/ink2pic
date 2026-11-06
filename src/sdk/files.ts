import {FileUtils} from 'sn-plugin-lib';
import {attempt, fail, ok, Result, THROWN_CODE} from './result';

/** FileUtils returns plain values or throws, unlike the APIResponse calls. */
function present<T>(raw: unknown, what: string): Result<T> {
  return raw === null || raw === undefined
    ? fail(THROWN_CODE, `${what} returned nothing`)
    : ok(raw as T);
}

export function exists(path: string): Promise<Result<boolean>> {
  return attempt(
    () => FileUtils.exists(path),
    raw => ok(Boolean(raw)),
  );
}

export function makeDir(path: string): Promise<Result<boolean>> {
  return attempt(
    () => FileUtils.makeDir(path),
    raw => ok(Boolean(raw)),
  );
}

export function listFiles(path: string): Promise<Result<string[]>> {
  return attempt(
    () => FileUtils.listFiles(path),
    raw => present(raw, 'listFiles'),
  );
}
