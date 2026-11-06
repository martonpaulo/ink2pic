import {PluginCommAPI} from 'sn-plugin-lib';
import {attempt, Result} from './result';

export type Rect = {left: number; top: number; right: number; bottom: number};

/** Read before anything else: lasso context is ephemeral (brief section 4.8). */
export function getLassoElements(): Promise<Result<object[]>> {
  return attempt(() => PluginCommAPI.getLassoElements());
}

export function getLassoRect(): Promise<Result<Rect>> {
  return attempt(() => PluginCommAPI.getLassoRect());
}

/** Uses the device's recognition language; there is no language parameter (brief section 4.5). */
export function recognizeElements(
  elements: object[],
  size: {width: number; height: number},
): Promise<Result<string>> {
  return attempt(() => PluginCommAPI.recognizeElements(elements, size));
}
