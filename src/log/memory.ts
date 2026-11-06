/**
 * The run log: every SDK call and network request with its answer and duration, shown to the
 * owner in the plugin (owner rule, 2026-11-06, AGENTS.md). Also sent to console.log for a device
 * log reader. The session log file is #21.
 */
import {fail, Result} from '../sdk/result';

const lines: string[] = [];
let started = Date.now();
const listeners = new Set<(lines: string[]) => void>();
let afterCall: () => void = () => {};

/** Called after each logged call: the session log file flushes here, on events (#21). */
export function setAfterCall(hook: () => void): void {
  afterCall = hook;
}

/** A call that never answers ends here, so the screen never stays stuck (build 0.1.0 (4), #11). */
export const CALL_TIMEOUT_MS = 20000;
/**
 * No time limit: build 0.1.0 (10) timed out a permission dialog while the owner read it, and
 * reported the permission as missing (#13).
 */
export const WAITS_FOR_PERSON = null;
/** The code of a call that hit CALL_TIMEOUT_MS; SDK codes are positive, module codes -2. */
export const TIMEOUT_CODE = -3;

/** Calls `listener` with every line as it is written; returns the function that stops it. */
export function onLog(listener: (lines: string[]) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function startLog(): void {
  lines.length = 0;
  started = Date.now();
  listeners.forEach(listener => listener(logLines()));
}

export function log(line: string): void {
  const entry = `+${Date.now() - started}ms ${line}`;
  lines.push(entry);
  console.log(`[Ink2Pic] ${entry}`);
  listeners.forEach(listener => listener(logLines()));
}

export function logLines(): string[] {
  return [...lines];
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
 * waits for the person, such as a permission dialog, passes WAITS_FOR_PERSON and has no limit.
 */
export async function logged<T>(
  label: string,
  call: () => Promise<Result<T>>,
  timeoutMs: number | typeof WAITS_FOR_PERSON = CALL_TIMEOUT_MS,
): Promise<Result<T>> {
  const at = Date.now();
  log(`${label} …`);
  // On disk before the call too: a call that makes the host close the plugin leaves its name (#13).
  afterCall();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = timeoutMs;
  const result =
    limit === WAITS_FOR_PERSON
      ? await call()
      : await Promise.race([
          call(),
          new Promise<Result<T>>(resolve => {
            timer = setTimeout(
              () =>
                resolve(
                  fail(TIMEOUT_CODE, `TIMEOUT: no answer in ${limit} ms`),
                ),
              limit,
            );
          }),
        ]).finally(() => clearTimeout(timer));
  const took = Date.now() - at;
  log(
    result.ok
      ? `${label} -> ok ${brief(result.value)} (${took} ms)`
      : `${label} -> error ${result.code}: ${result.message} (${took} ms)`,
  );
  afterCall();
  return result;
}
