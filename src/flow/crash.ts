/**
 * Any unhandled JS error is written to MyStyle/Ink2Pic/logs/crash.log, so it survives the plugin
 * closing (build 0.1.0 (9) closed with no trace, #13). It is never written into the user's note
 * (#36). The previous handler still runs afterwards.
 */
import {log, logLines} from '../log/memory';
import {writeText} from '../storage/files';
import {logsDir} from '../storage/paths';
import {SHARED_ROOT} from './session';

/** The last log lines carried in the report. */
const CRASH_LOG_LINES = 30;
const STACK_CHARS = 600;
/** How long a fatal error waits for crash.log before the previous handler ends the process. */
const CRASH_WRITE_MS = 2000;

type Handler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsLike = {
  getGlobalHandler: () => Handler;
  setGlobalHandler: (handler: Handler) => void;
};

export function crashReport(
  error: unknown,
  isFatal: boolean | undefined,
  lines: string[],
): string {
  const message = error instanceof Error ? error.message : String(error);
  const stack =
    error instanceof Error
      ? String(error.stack ?? '').slice(0, STACK_CHARS)
      : '';
  return [
    `Ink2Pic error${isFatal ? ' (fatal)' : ''}: ${message}`,
    stack,
    '',
    ...lines.slice(-CRASH_LOG_LINES),
  ].join('\n');
}

export function catchCrashes(): void {
  const utils = (globalThis as {ErrorUtils?: ErrorUtilsLike}).ErrorUtils;
  if (!utils) {
    log('crash handler: ErrorUtils missing');
    return;
  }
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => {
    const text = crashReport(error, isFatal, logLines());
    log(text.split('\n')[0]);
    const written = writeText(`${logsDir(SHARED_ROOT)}/crash.log`, text);
    if (!isFatal) {
      previous(error, isFatal);
      return;
    }
    // A fatal error ends the process: crash.log, the only trace, gets a moment to land first.
    // The timer is cleared once the write lands, so nothing outlives the handler (#56).
    let timer: ReturnType<typeof setTimeout> | undefined;
    const moment = new Promise(resolve => {
      timer = setTimeout(resolve, CRASH_WRITE_MS);
    });
    Promise.race([written, moment]).then(() => {
      clearTimeout(timer);
      previous(error, isFatal);
    });
  });
  log('crash handler: ok');
}
