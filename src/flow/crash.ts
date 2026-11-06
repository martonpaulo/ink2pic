/**
 * Any unhandled JS error is written where the owner sees it even when the plugin closes: into
 * the current page as a text box, and into MyStyle/Ink2Pic/logs/crash.log (build 0.1.0 (9)
 * closed with no trace, #13). The previous handler still runs afterwards.
 */
import {log, logLines} from '../log/memory';
import {insertText} from '../sdk/note';
import {writeText} from '../storage/files';
import {logsDir} from '../storage/paths';
import {SHARED_ROOT} from './session';

/** Where the report lands on a 1920 x 2560 Manta page. */
const CRASH_RECT = {left: 120, top: 160, right: 1800, bottom: 2400};
const CRASH_FONT_SIZE = 24;
/** The last log lines carried in the report. */
const CRASH_LOG_LINES = 30;
const STACK_CHARS = 600;

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
    insertText({text, rect: CRASH_RECT, fontSize: CRASH_FONT_SIZE});
    writeText(`${logsDir(SHARED_ROOT)}/crash.log`, text);
    previous(error, isFatal);
  });
  log('crash handler: ok');
}
