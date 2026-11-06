/**
 * The private plugin folder, read once per runtime and cached (brief section 8.5: minimize SDK
 * round trips). The shared-storage folders are fixed and come from `./paths`; index.js opens the
 * log file before any view exists (#21, #45).
 */
import {logged} from '../log/memory';
import {getPluginDirPath} from '../sdk/plugin';
import {ok, Result} from '../sdk/result';

let cached: string | null = null;

export async function pluginFolder(): Promise<Result<string>> {
  if (cached) {
    return ok(cached);
  }
  const dir = await logged('getPluginDirPath', getPluginDirPath);
  if (dir.ok) {
    cached = dir.value;
  }
  return dir;
}

export function resetSessionForTests(): void {
  cached = null;
}
