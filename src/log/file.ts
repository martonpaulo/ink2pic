/**
 * The session log file, MyStyle/Ink2Pic/logs/session.log (brief sections 10.3 and 18.2, #21).
 * The file is rewritten from the in-memory log at each flush, never on a timer (JS timers stop
 * while the view is closed, brief section 3.3); the previous session is kept as session.prev.log.
 */
import {logLines} from './memory';
import {readText, writeText} from '../storage/files';

/** Lines kept in the file: enough for a whole session, small enough to rewrite. */
export const LOG_FILE_MAX_LINES = 2000;

let target: string | null = null;
let writing: Promise<unknown> = Promise.resolve();

/** `<shared root>/MyStyle/Ink2Pic/logs`; keeps the previous session's file once. */
export async function openLogFile(logsDir: string): Promise<void> {
  const path = `${logsDir}/session.log`;
  if (target === path) {
    return;
  }
  target = path;
  const previous = await readText(path);
  if (previous.ok && previous.value) {
    await writeText(`${logsDir}/session.prev.log`, previous.value);
  }
}

/** Writes the current log to the file; writes run one after another. A failure stays silent here
 * because logging it would loop; the screen log still has every line. */
export function flushLogFile(): Promise<unknown> {
  if (!target) {
    return writing;
  }
  const path = target;
  const text = logLines().slice(-LOG_FILE_MAX_LINES).join('\n') + '\n';
  writing = writing.then(() => writeText(path, text));
  return writing;
}

export function closeLogFileForTests(): void {
  target = null;
  writing = Promise.resolve();
}
