import {PluginManager} from 'sn-plugin-lib';
import {attempt, fail, ok, Result, THROWN_CODE} from './result';

export const PERMISSION_INTERNET = 'plugin.permission.INTERNET';
export const PERMISSION_FILE_READ = 'plugin.permission.FILE:READ';
export const PERMISSION_FILE_WRITE = 'plugin.permission.FILE:WRITE';

/**
 * `hasPermission` answers that mean granted: the SDK's Java documents 1 and 2 (this time, always),
 * its JS only 1; both count (sn-plugin-lib 0.2.3 source, #34).
 */
const GRANTED = new Set([1, 2]);

/** A numeric host answer; anything else is a failure, never NaN reported as success. */
function toNumber(raw: unknown): Result<number> {
  return typeof raw === 'number' && Number.isFinite(raw)
    ? ok(raw)
    : fail(THROWN_CODE, `expected a number, got ${String(raw)}`);
}

/** The host's answer: 0 denied, 1 allowed once, 2 always, -1 cancelled (brief section 3.6). */
export function requestPermission(
  permission: string,
  description?: string,
): Promise<Result<number>> {
  return attempt(
    () => PluginManager.requestPermission(permission, description),
    toNumber,
  );
}

export function hasPermission(permission: string): Promise<Result<boolean>> {
  return attempt(
    () => PluginManager.hasPermission(permission),
    raw => {
      const answer = toNumber(raw);
      return answer.ok ? ok(GRANTED.has(answer.value)) : answer;
    },
  );
}

/** The private plugin directory, which needs no permission (brief section 3.6). */
export function getPluginDirPath(): Promise<Result<string>> {
  return attempt(
    () => PluginManager.getPluginDirPath(),
    raw =>
      typeof raw === 'string' && raw
        ? ok(raw)
        : fail(THROWN_CODE, 'getPluginDirPath returned nothing'),
  );
}

export function closePluginView(): Promise<Result<boolean>> {
  return attempt(
    () => PluginManager.closePluginView(),
    raw => ok(Boolean(raw)),
  );
}
