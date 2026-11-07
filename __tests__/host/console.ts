/**
 * The console.error gate (#112): every suite runs with console.error watched, and a test fails
 * when it logs an error it did not expect. React's act() warnings and a missing native module go
 * through console.error, and a passing gate hid them. A test that expects an error says so with
 * `allowConsoleError(/pattern/)` before it happens; the allowance ends with the test.
 *
 * The state lives on globalThis, so it is the same in the jest setup file and in a test that
 * imports this module after `jest.resetModules()` or inside `jest.isolateModules()`.
 */
import {format} from 'node:util';

type Guard = {allowed: RegExp[]; unexpected: string[]};

const KEY = Symbol.for('ink2pic.consoleErrorGuard');

function guard(): Guard {
  const holder = globalThis as unknown as Record<symbol, Guard | undefined>;
  holder[KEY] ??= {allowed: [], unexpected: []};
  return holder[KEY];
}

/** Lets the current test log console.error lines that match `pattern`. */
export function allowConsoleError(pattern: RegExp): void {
  guard().allowed.push(pattern);
}

/** Records one console.error line; true when no allowance expects it, so it counts and prints. */
export function noteConsoleError(text: string): boolean {
  const state = guard();
  if (state.allowed.some(pattern => pattern.test(text))) {
    return false;
  }
  state.unexpected.push(text);
  return true;
}

/** Replaces console.error with a recorder that still prints, for the jest setup file. */
export function watchConsoleError(): void {
  const original = console.error;
  console.error = (...args: unknown[]) => {
    if (noteConsoleError(format(...args))) {
      original(...args);
    }
  };
}

/** Clears the allowances at the start of a test. */
export function resetConsoleError(): void {
  guard().allowed = [];
}

/** Throws when a console.error line came that no test expected, and forgets it. */
export function failOnConsoleError(when: string): void {
  const found = guard().unexpected.splice(0);
  if (found.length > 0) {
    throw new Error(
      `${found.length} unexpected console.error line(s) ${when}; fix the cause, or call ` +
        `allowConsoleError() in the test that expects it (#112):\n` +
        found.map(text => `  ${text.split('\n')[0]}`).join('\n'),
    );
  }
}
