/**
 * Reads a session log the device wrote (MyStyle/Ink2Pic/logs/session.log, #3) and replays its SDK
 * answers through the PluginHost simulator (#79). The line format is the one src/log/memory.ts
 * writes: `+<ms>ms <label> …` when a call starts, `+<ms>ms <label> -> ok <value> (<n> ms)` or
 * `+<ms>ms <label> -> error <code>: <message> (<n> ms)` when it ends, and free lines such as
 * `button 100 (live)` or `lifecycle 2`. A logcat line keeps its `[Ink2Pic] ` prefix, which the
 * parser accepts.
 */
import {failure, PluginHost, success} from './pluginHost';

export type LogLine =
  | {kind: 'start'; at: number; label: string; method: string}
  | {kind: 'ok'; at: number; label: string; method: string; value: unknown; cut: boolean}
  | {kind: 'error'; at: number; label: string; method: string; code: number; message: string}
  | {kind: 'note'; at: number; text: string};

const LINE = /^(?:\[Ink2Pic\] )?\+(\d+)ms (.*)$/;
const OK = /^(.*?) -> ok (.*) \(\d+ ms\)$/;
const ERROR = /^(.*?) -> error (-?\d+): (.*) \(\d+ ms\)$/;
const START = /^(.*) …$/;
/** The mark brief() leaves on a value it cut: `…(<full length>)`. */
const CUT = /…\(\d+\)$/;

/** The SDK or module method a label names: `hasPermission(…)` and `getPenInfo (before…)` too. */
function methodOf(label: string): string {
  return /^[A-Za-z_$][\w$]*/.exec(label)?.[0] ?? label;
}

function parseValue(text: string): {value: unknown; cut: boolean} {
  if (CUT.test(text)) {
    return {value: null, cut: true};
  }
  try {
    return {value: JSON.parse(text), cut: false};
  } catch {
    return {value: text, cut: false};
  }
}

/** Parses one log line; null for a line in no known format, such as a blank one. */
export function parseLine(line: string): LogLine | null {
  const match = LINE.exec(line);
  if (!match) {
    return null;
  }
  const at = Number(match[1]);
  const rest = match[2];
  const ok = OK.exec(rest);
  if (ok) {
    return {kind: 'ok', at, label: ok[1], method: methodOf(ok[1]), ...parseValue(ok[2])};
  }
  const error = ERROR.exec(rest);
  if (error) {
    return {
      kind: 'error',
      at,
      label: error[1],
      method: methodOf(error[1]),
      code: Number(error[2]),
      message: error[3],
    };
  }
  const start = START.exec(rest);
  if (start) {
    return {kind: 'start', at, label: start[1], method: methodOf(start[1])};
  }
  return {kind: 'note', at, text: rest};
}

export function parseLog(text: string): LogLine[] {
  return text
    .split('\n')
    .map(parseLine)
    .filter((line): line is LogLine => line !== null);
}

/** The calls the log records, in the order they started. */
export function loggedCalls(lines: LogLine[]): string[] {
  return lines.flatMap(line => (line.kind === 'start' ? [line.method] : []));
}

/**
 * Queues every logged answer on the simulator, per method, in the logged order. A value brief()
 * cut is not scripted.
 * shortcut: after a cut answer, the method's later logged answers come one call early; a fixture
 * whose method answers again after a cut needs the simulator to fall through for that call.
 */
export function scriptAnswers(host: PluginHost, lines: LogLine[]): void {
  for (const line of lines) {
    if (line.kind === 'ok' && !line.cut) {
      host.script(line.method, async () => success(line.value));
    } else if (line.kind === 'error') {
      host.script(line.method, async () => failure(line.code, line.message));
    }
  }
}
