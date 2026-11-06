import {PluginManager} from 'sn-plugin-lib';
import {attempt, fail, ok, Result, THROWN_CODE} from './result';

export const PERMISSION_INTERNET = 'plugin.permission.INTERNET';
export const PERMISSION_FILE_READ = 'plugin.permission.FILE:READ';
export const PERMISSION_FILE_WRITE = 'plugin.permission.FILE:WRITE';

/** `hasPermission` answer for a granted permission. */
export const GRANTED = 1;

/** A numeric host answer; anything else is a failure, never NaN reported as success. */
function toNumber(raw: unknown): Result<number> {
  return typeof raw === 'number' && Number.isFinite(raw)
    ? ok(raw)
    : fail(THROWN_CODE, `expected a number, got ${String(raw)}`);
}

/** `5` is the Manta (A5X2), per brief section 2. */
export function getDeviceType(): Promise<Result<number>> {
  return attempt(() => PluginManager.getDeviceType(), toNumber);
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
      return answer.ok ? ok(answer.value === GRANTED) : answer;
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

export type ButtonPress = {id: number};

/** Calls `onPress` for every plugin button press; returns the function that stops listening. */
export function onButtonPress(
  onPress: (event: ButtonPress) => void,
): () => void {
  const subscription = PluginManager.registerButtonListener({
    onButtonPress: event => onPress({id: event.id}),
  });
  return () => subscription.remove();
}
