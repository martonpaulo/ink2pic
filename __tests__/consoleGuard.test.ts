/** The console.error gate (#112): an unexpected error fails the test, an expected one does not. */
import {
  allowConsoleError,
  failOnConsoleError,
  noteConsoleError,
} from './host/console';

const line = 'Ink2Pic: config button failed: -1 no host';

it('fails on a console.error the test did not expect, and names it', () => {
  expect(noteConsoleError(line)).toBe(true);
  expect(() => failOnConsoleError('in this test')).toThrow(
    /1 unexpected console.error line\(s\) in this test[\s\S]*config button failed/,
  );
  // Reported lines are forgotten, so the gate after this test passes.
  expect(() => failOnConsoleError('in this test')).not.toThrow();
});

it('lets a test log the error it expects, without printing it', () => {
  allowConsoleError(/^Ink2Pic: config button failed/);
  expect(noteConsoleError(line)).toBe(false);
  console.error(line);
  expect(() => failOnConsoleError('in this test')).not.toThrow();
});

it('ends an allowance with the test that made it', () => {
  expect(noteConsoleError(line)).toBe(true);
  expect(() => failOnConsoleError('in this test')).toThrow(/1 unexpected/);
});
