/**
 * Paths for one plugin session, read once and cached (brief section 8.5: minimize SDK round
 * trips): the shared-storage root and the private plugin folder. Opening the session also opens
 * the log file (#21) and loads the library (#14).
 */
import {flushLogFile, openLogFile} from '../log/file';
import {logged, setAfterCall} from '../log/memory';
import {getPluginDirPath} from '../sdk/plugin';
import {fail, ok, Result} from '../sdk/result';
import {logsDir} from '../storage/paths';

/**
 * The shared storage root, as the host's own paths show it (`getCurrentFilePath` answered
 * `/storage/emulated/0/Note/...` on the Manta, builds 0.1.0 (3) to (8)). Not read through
 * FileUtils.getExternalDirPath: its module can close the plugin on an error (#13).
 */
export const SHARED_ROOT = '/storage/emulated/0';

export type SessionPaths = {root: string; pluginDir: string};

let cached: SessionPaths | null = null;

export async function sessionPaths(): Promise<Result<SessionPaths>> {
  if (cached) {
    return ok(cached);
  }
  const dir = await logged('getPluginDirPath', getPluginDirPath);
  if (!dir.ok) {
    return dir;
  }
  cached = {root: SHARED_ROOT, pluginDir: dir.value};
  openLogFile(logsDir(cached.root));
  setAfterCall(() => {
    flushLogFile();
  });
  return cached ? ok(cached) : fail(-1, 'no session paths');
}

export function resetSessionForTests(): void {
  cached = null;
}
