/**
 * The session log file, MyStyle/Ink2Pic/logs/session.log (brief sections 10.3 and 18.2, #21).
 * Each flush appends the lines logged since the last one (#102), never on a timer (JS timers stop
 * while the view is closed, brief section 3.3); the previous session is kept as session.prev.log.
 */
import {LOG_MAX_LINES, logCount, logLines, startLog} from '../log/memory';
import {appendText, readText, writeText} from './files';

/** Lines a rewrite keeps: the in-memory cap, so a new file holds what the screen log holds. */
export const LOG_FILE_MAX_LINES = LOG_MAX_LINES;
/** Appends stop here and the next flush rewrites the file, so it never grows past this. */
export const LOG_FILE_REWRITE_LINES = 2 * LOG_FILE_MAX_LINES;

let target: string | null = null;
let writing: Promise<unknown> = Promise.resolve();
/** The write queued behind the running one; later flushes join it (#45). */
let queued: Promise<unknown> | null = null;
/** The first opening keeps the lines index.js logged before the view mounted. */
let opened = false;
/**
 * The file's state: `upTo` is the logCount() its last line has, `lines` how many it holds; null
 * until this opening's first write, and after a failed one: the next flush rewrites the file.
 */
let file: {upTo: number; lines: number} | null = null;

/** `<shared root>/MyStyle/Ink2Pic/logs`: where flushes write from now on. */
export function openLogFile(logsDir: string): void {
  target = `${logsDir}/session.log`;
}

function joined(lines: string[]): string {
  return lines.length > 0 ? lines.join('\n') + '\n' : '';
}

/**
 * Appends the lines logged since the last write; rewrites the whole file at an opening's first
 * write, after a failed write, when lines were dropped before they reached the file, and when the
 * file would pass LOG_FILE_REWRITE_LINES.
 */
async function write(path: string): Promise<unknown> {
  const upTo = logCount();
  const lines = logLines();
  const fresh = file ? upTo - file.upTo : Infinity;
  if (fresh === 0) {
    return;
  }
  // A log started again without startSession counts back from zero: rewrite then too.
  const append =
    file !== null &&
    fresh > 0 &&
    fresh <= lines.length &&
    file.lines + fresh <= LOG_FILE_REWRITE_LINES;
  const kept = append ? lines.slice(-fresh) : lines.slice(-LOG_FILE_MAX_LINES);
  const written = append
    ? await appendText(path, joined(kept))
    : await writeText(path, joined(kept));
  file = written.ok
    ? {upTo, lines: (append && file ? file.lines : 0) + kept.length}
    : null;
  return written;
}

/** Runs `step` after every write already queued, so file writes never overlap. */
function enqueue(step: () => Promise<unknown>): Promise<unknown> {
  writing = writing.then(step, step);
  return writing;
}

/**
 * Starts the log of a new opening (#45): the last opening's lines become session.prev.log and
 * the log starts empty. The opening controller asks for it before the opening's first line (#58),
 * so session.log holds one whole opening. Called at each opening, because the JS runtime outlives
 * the view (review of build 0.1.0 (8), #33). The first opening of a runtime keeps the
 * registration lines and keeps the file a previous runtime left.
 */
export async function startSession(): Promise<void> {
  const first = !opened;
  opened = true;
  let previous: string | null = null;
  if (!first) {
    const all = logLines();
    previous = all.length > 0 ? all.join('\n') + '\n' : '';
    startLog([]);
    file = null;
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
 * Writes the new lines to the file, at most one write behind the running one: flushes that
 * arrive while a write runs share one queued write, which takes the newest lines when it starts
 * (#45). A failure stays silent here because logging it would loop; the screen log has every line,
 * and the next flush rewrites the file.
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
    return write(path);
  });
  queued = mine;
  return mine;
}

export function closeLogFileForTests(): void {
  target = null;
  writing = Promise.resolve();
  queued = null;
  opened = false;
  file = null;
}
