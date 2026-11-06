/**
 * The session log file, MyStyle/Ink2Pic/logs/session.log (brief sections 10.3 and 18.2, #21).
 * The file is rewritten from the in-memory log at each flush, never on a timer (JS timers stop
 * while the view is closed, brief section 3.3); the previous session is kept as session.prev.log.
 */
import {LOG_MAX_LINES, logLines, startLog} from './memory';
import {readText, writeText} from '../storage/files';

/** Lines kept in the file: the in-memory cap, so a file holds what the screen log holds. */
export const LOG_FILE_MAX_LINES = LOG_MAX_LINES;

let target: string | null = null;
let writing: Promise<unknown> = Promise.resolve();
/** The write queued behind the running one; later flushes join it (#45). */
let queued: Promise<unknown> | null = null;
/** The first opening keeps the lines index.js logged before the view mounted. */
let opened = false;

/** `<shared root>/MyStyle/Ink2Pic/logs`: where flushes write from now on. */
export function openLogFile(logsDir: string): void {
  target = `${logsDir}/session.log`;
}

function logText(): string {
  return logLines().slice(-LOG_FILE_MAX_LINES).join('\n') + '\n';
}

/** Runs `step` after every write already queued, so file writes never overlap. */
function enqueue(step: () => Promise<unknown>): Promise<unknown> {
  writing = writing.then(step, step);
  return writing;
}

/**
 * The line App.tsx logs for the press that starts an opening, such as `button 200 (live)`.
 * shortcut: the opening is cut at this line because startSession runs after the press; once
 * the opening code calls startSession at the press itself, drop it and keep nothing.
 */
const PRESS_LINE = /^\+\d+ms button \d+ \([^)]*\)$/;

/**
 * Starts the log of a new opening (#45): the last opening's lines become session.prev.log and
 * the log keeps only this opening's lines, from its press on, so session.log holds this opening
 * only. Called at each opening, because the JS runtime outlives the view (review of build 0.1.0
 * (8), #33). The first opening of a runtime keeps the registration lines and keeps the file a
 * previous runtime left.
 */
export async function startSession(): Promise<void> {
  const first = !opened;
  opened = true;
  let previous: string | null = null;
  if (!first) {
    const all = logLines();
    let press = all.length;
    while (press > 0 && !PRESS_LINE.test(all[press - 1])) {
      press -= 1;
    }
    const cut = press > 0 ? press - 1 : all.length;
    previous = cut > 0 ? all.slice(0, cut).join('\n') + '\n' : '';
    startLog(all.slice(cut));
  }
  if (!target) {
    return;
  }
  const path = target;
  const prevPath = path.replace(/session\.log$/, 'session.prev.log');
  await enqueue(async () => {
    const text = previous ?? (await readText(path));
    const value = typeof text === 'string' ? text : text.ok ? text.value : '';
    if (value) {
      await writeText(prevPath, value);
    }
  });
  await flushLogFile();
}

/**
 * Writes the current log to the file, at most one write behind the running one: flushes that
 * arrive while a write runs share one queued write, which takes the newest lines when it starts
 * (#45). A failure stays silent here because logging it would loop; the screen log has every line.
 */
export function flushLogFile(): Promise<unknown> {
  if (!target) {
    return writing;
  }
  if (queued) {
    return queued;
  }
  const path = target;
  const mine = enqueue(() => {
    queued = null;
    return writeText(path, logText());
  });
  queued = mine;
  return mine;
}

export function closeLogFileForTests(): void {
  target = null;
  writing = Promise.resolve();
  queued = null;
  opened = false;
}
