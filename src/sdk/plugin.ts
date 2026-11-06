import {PluginManager} from 'sn-plugin-lib';
import {attempt, ok, Result} from './result';

export const PERMISSION_INTERNET = 'plugin.permission.INTERNET';

/** `5` is the Manta (A5X2), per brief section 2. */
export function getDeviceType(): Promise<Result<number>> {
  return attempt(
    () => PluginManager.getDeviceType(),
    raw => ok(Number(raw)),
  );
}

/** The host's answer: 0 denied, 1 allowed once, 2 always, -1 cancelled (brief section 3.6). */
export function requestPermission(
  permission: string,
  description?: string,
): Promise<Result<number>> {
  return attempt(
    () => PluginManager.requestPermission(permission, description),
    raw => ok(Number(raw)),
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
