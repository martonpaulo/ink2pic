import {fetchText} from '../src/sources/http';

const reply = (status: number, body = '') =>
  jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
  });

describe('fetchText', () => {
  it('returns the body', async () => {
    expect(
      await fetchText('https://x.test/', {fetch: reply(200, 'hi')}),
    ).toEqual({
      ok: true,
      text: 'hi',
    });
  });

  it.each([403, 429])('maps HTTP %i to throttled', async status => {
    const outcome = await fetchText('https://x.test/', {fetch: reply(status)});
    expect(outcome).toEqual({
      ok: false,
      kind: 'throttled',
      message: `HTTP ${status}`,
    });
  });

  it('maps another error status to http', async () => {
    expect(await fetchText('https://x.test/', {fetch: reply(500)})).toEqual({
      ok: false,
      kind: 'http',
      message: 'HTTP 500',
    });
  });

  it('maps a thrown error to network', async () => {
    const fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('Network request failed'));
    expect(await fetchText('https://x.test/', {fetch})).toEqual({
      ok: false,
      kind: 'network',
      message: 'Network request failed',
    });
  });

  it('times out a request that never answers', async () => {
    const fetch = jest.fn(
      (_url: string, init: {signal: AbortSignal}) =>
        new Promise<never>((_resolve, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
        }),
    );
    expect(await fetchText('https://x.test/', {fetch, timeoutMs: 10})).toEqual({
      ok: false,
      kind: 'timeout',
      message: 'no answer in 10 ms',
    });
  });

  it('merges extra headers with the User-Agent', async () => {
    const fetch = reply(200);
    await fetchText('https://x.test/', {fetch}, {'Api-User-Agent': 'a'});
    expect(Object.keys(fetch.mock.calls[0][1].headers)).toEqual([
      'User-Agent',
      'Api-User-Agent',
    ]);
  });
});
