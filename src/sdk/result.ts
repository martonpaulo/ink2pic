/**
 * One result type for every SDK call, so no failure is swallowed and none throws past a wrapper.
 */
export type Failure = {
  ok: false;
  code: number;
  message: string;
  /** The text code a plugin native module rejected with, such as `IO` or `TOO_LARGE` (#49). */
  moduleCode?: string;
};
export type Result<T> = {ok: true; value: T} | Failure;

/*
 * Every negative code, here and nowhere else (#49): the SDK's own codes are positive.
 */
/** A call threw, or answered outside its expected shape. */
export const THROWN_CODE = -1;
/** A plugin native module rejected; its text code is in `moduleCode`. */
export const MODULE_CODE = -2;
/** A call gave no answer within its time limit. */
export const TIMEOUT_CODE = -3;
/** The lasso holds no handwriting. */
export const EMPTY_LASSO_CODE = -4;

type SdkResponse = {
  success?: boolean;
  result?: unknown;
  error?: {code?: number; message?: string} | null;
};

export function ok<T>(value: T): Result<T> {
  return {ok: true, value};
}

export function fail(
  code: number,
  message: string,
  moduleCode?: string,
): Failure {
  return moduleCode === undefined
    ? {ok: false, code, message}
    : {ok: false, code, message, moduleCode};
}

/** Maps the SDK's `{success, result, error}` response to a Result. */
export function fromResponse<T>(response: unknown): Result<T> {
  if (response === null || typeof response !== 'object') {
    return fail(THROWN_CODE, `unexpected response: ${String(response)}`);
  }
  const r = response as SdkResponse;
  if (r.success === true) {
    return ok(r.result as T);
  }
  return fail(
    r.error?.code ?? THROWN_CODE,
    r.error?.message ?? 'the call failed with no error message',
  );
}

/** Runs an SDK call and turns a thrown error into a Failure. */
export async function attempt<T>(
  call: () => Promise<unknown>,
  map: (raw: unknown) => Result<T> = fromResponse,
): Promise<Result<T>> {
  try {
    return map(await call());
  } catch (error) {
    return fail(
      THROWN_CODE,
      error instanceof Error ? error.message : String(error),
    );
  }
}
