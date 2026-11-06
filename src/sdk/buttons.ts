import {PluginManager} from 'sn-plugin-lib';
import {attempt, fail, ok, Result, THROWN_CODE} from './result';

/** Must run at startup (brief section 4.1). */
export function initPlugin(): Result<true> {
  try {
    PluginManager.init();
    return ok(true);
  } catch (error) {
    return fail(
      THROWN_CODE,
      error instanceof Error ? error.message : String(error),
    );
  }
}

/** Registers one plugin button; a `false` answer from the host is a failure. */
export function registerButton(
  type: number,
  appTypes: string[],
  config: object,
): Promise<Result<true>> {
  return attempt(
    () => PluginManager.registerButton(type, appTypes, config),
    raw =>
      raw === true
        ? ok(true)
        : fail(THROWN_CODE, `registerButton answered ${String(raw)}`),
  );
}
