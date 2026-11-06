/**
 * One result type for every SDK call, so no failure is swallowed and none throws past a wrapper.
 */
export type Failure = {ok: false; code: number; message: string};
export type Result<T> = {ok: true; value: T} | Failure;

/** Code used when a call threw instead of returning the SDK's response shape. */
export const THROWN_CODE = -1;

type SdkResponse = {
  success?: boolean;
  result?: unknown;
  error?: {code?: number; message?: string} | null;
};

export function ok<T>(value: T): Result<T> {
  return {ok: true, value};
}

export function fail(code: number, message: string): Failure {
  return {ok: false, code, message};
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
