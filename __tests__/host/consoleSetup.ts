/** Jest setup (setupFilesAfterEnv): the console.error gate of ./console.ts on every suite (#112). */
import {
  failOnConsoleError,
  resetConsoleError,
  watchConsoleError,
} from './console';

watchConsoleError();
beforeEach(() => resetConsoleError());
afterEach(() => failOnConsoleError('in this test'));
// An error logged after the last test ended, by work the suite left running.
afterAll(() => failOnConsoleError('after the last test'));
