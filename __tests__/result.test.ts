import {attempt, fromResponse, THROWN_CODE} from '../src/sdk/result';

describe('fromResponse', () => {
  it('maps success to its result', () => {
    expect(fromResponse({success: true, result: 3})).toEqual({
      ok: true,
      value: 3,
    });
  });

  it('keeps the SDK error code and message', () => {
    expect(
      fromResponse({success: false, error: {code: 904, message: 'no lasso'}}),
    ).toEqual({
      ok: false,
      code: 904,
      message: 'no lasso',
    });
  });

  it('treats a missing response as a failure', () => {
    expect(fromResponse(null).ok).toBe(false);
  });
});

describe('attempt', () => {
  it('turns a thrown error into a failure', async () => {
    const result = await attempt(() => Promise.reject(new Error('boom')));
    expect(result).toEqual({ok: false, code: THROWN_CODE, message: 'boom'});
  });
});
