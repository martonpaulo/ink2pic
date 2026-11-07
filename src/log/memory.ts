/**
 * The run log: every SDK call and network request with its answer and duration, shown to the
 * owner in the plugin (owner rule, 2026-11-06, AGENTS.md). Also sent to console.log for a device
 * log reader. The session log file is #21.
 */
import {fail, Result, TIMEOUT_CODE} from '../sdk/result';

/** Lines kept in memory and in the file: enough for a whole opening, small enough to rewrite (#45). */
export const LOG_MAX_LINES = 2000;

const lines: string[] = [];
let started = Date.now();
const listeners = new Set<(lines: string[]) => void>();
let afterCall: () => unknown = () => {};

/**
 * Called after each logged call, and awaited before a call that can close the plugin: the
 * session log file flushes here, on events (#21, #45).
 */
export function setAfterCall(hook: () => unknown): void {
  afterCall = hook;
}

/**
 * Calls that can end the plugin while they run, so their name must be on disk before they start
 * (#13, #45): closePluginView closes it by design; an insert hands the screen back to the note;
 * a pending requestPermission is answered -1 when the host hides or destroys the plugin (brief
 * section 10.5). Every other call flushes once, after its answer.
 */
const CLOSING_CALLS = [
  'closePluginView',
  'insertImage',
  'insertPageElements',
  'requestPermission',
];

export function canClosePlugin(label: string): boolean {
  return CLOSING_CALLS.some(name => label.startsWith(name));
}

/** A call that never answers ends here, so the screen never stays stuck (build 0.1.0 (4), #11). */
export const CALL_TIMEOUT_MS = 20000;
/**
 * A call that waits for the person, such as a permission dialog: build 0.1.0 (10) timed out the
 * dialog at 20 s while the owner read it (#13); a limit stays, so a dialog the host never answers
 * cannot hold the screen for good.
 */
export const PERSON_TIMEOUT_MS = 5 * 60 * 1000;
/** Calls `listener` with every line as it is written; returns the function that stops it. */
export function onLog(listener: (lines: string[]) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Empties the log; `keep` are lines that already belong to the new log, kept with their times. */
export function startLog(keep: string[] = []): void {
  lines.splice(0, lines.length, ...keep);
  if (keep.length === 0) {
    started = Date.now();
  }
  listeners.forEach(listener => listener(logLines()));
}

export function log(line: string): void {
  const entry = `+${Date.now() - started}ms ${line}`;
  lines.push(entry);
  if (lines.length > LOG_MAX_LINES) {
    lines.splice(0, lines.length - LOG_MAX_LINES);
  }
  console.log(`[Ink2Pic] ${entry}`);
  listeners.forEach(listener => listener(logLines()));
}

export function logLines(): string[] {
  return [...lines];
}

/**
 * One step of «Insert picture» with its duration since `since` (#88): `time <step>: <ms> ms`,
 * so the session log shows where an insert spends its time.
 */
export function logTime(step: string, since: number, detail = ''): void {
  log(`time ${step}: ${Date.now() - since} ms${detail ? `, ${detail}` : ''}`);
}

/**
 * Runs one wait and logs the time it starts and how long it took, so the device log shows
 * whether JS timers stop with no view (#93).
 */
export async function timed<T>(
  step: string,
  work: () => Promise<T>,
): Promise<T> {
  const at = Date.now();
  log(`wait ${step}: start at ${at}`);
  try {
    return await work();
  } finally {
    log(`wait ${step}: ${Date.now() - at} ms`);
  }
}

/** Long enough for a lasso rect or a page size, short enough for the report. */
const BRIEF_MAX = 160;

/** Compact JSON of a value, cut to `max` characters. */
export function brief(value: unknown, max = BRIEF_MAX): string {
  let text: string;
  try {
    text = JSON.stringify(value) ?? String(value);
  } catch {
    text = String(value);
  }
  return text.length > max ? `${text.slice(0, max)}…(${text.length})` : text;
}

/**
 * Runs one SDK or module call and logs its label, answer and duration. The start is logged too,
 * so a call that hangs shows where; after `timeoutMs` it fails with TIMEOUT_CODE. A call that
 * waits for the person passes PERSON_TIMEOUT_MS.
 */
export async function logged<T>(
  label: string,
  call: () => Promise<Result<T>>,
  timeoutMs = CALL_TIMEOUT_MS,
): Promise<Result<T>> {
  const at = Date.now();
  log(`${label} …`);
  // On disk before a call that can close the plugin, so it leaves its name (#13); only those (#45).
  if (canClosePlugin(label)) {
    await afterCall();
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<Result<T>>(resolve => {
    timer = setTimeout(
      () =>
        resolve(fail(TIMEOUT_CODE, `TIMEOUT: no answer in ${timeoutMs} ms`)),
      timeoutMs,
    );
  });
  const result = await Promise.race([call(), expired]).finally(() =>
    clearTimeout(timer),
  );
  const took = Date.now() - at;
  log(
    result.ok
      ? `${label} -> ok ${brief(result.value)} (${took} ms)`
      : `${label} -> error ${result.code}: ${result.message} (${took} ms)`,
  );
  afterCall();
  return result;
}
