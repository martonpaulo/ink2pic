/**
 * The spike's run log: every SDK call and network request with its raw answer and duration,
 * printed in the report so one screenshot carries it (owner request, 2026-11-06). Also sent to
 * console.log for a device log reader. A file log waits for a file writer (#11, #21).
 */
import type {Result} from '../sdk/result';

const lines: string[] = [];
let started = Date.now();

export function startLog(): void {
  lines.length = 0;
  started = Date.now();
}

export function log(line: string): void {
  const entry = `+${Date.now() - started}ms ${line}`;
  lines.push(entry);
  console.log(`[Ink2Pic] ${entry}`);
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

/** Runs one SDK wrapper and logs its label, answer and duration. */
export async function logged<T>(
  label: string,
  call: () => Promise<Result<T>>,
): Promise<Result<T>> {
  const at = Date.now();
  const result = await call();
  const took = Date.now() - at;
  log(
    result.ok
      ? `${label} -> ok ${brief(result.value)} (${took} ms)`
      : `${label} -> error ${result.code}: ${result.message} (${took} ms)`,
  );
  return result;
}
