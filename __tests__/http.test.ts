import {createFetcher, FetchLike} from '../src/search-core/fetcher';

const reply = (status: number, body = '') =>
  jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
  });
const fetcher = (fetch: FetchLike, timeoutMs?: number) =>
  createFetcher({fetch, userAgent: 'Ink2Pic/test', timeoutMs});

describe('createFetcher', () => {
  it('returns the body', async () => {
    expect(await fetcher(reply(200, 'hi'))('https://x.test/')).toEqual({
      ok: true,
      text: 'hi',
    });
  });

  it.each([403, 429])('maps HTTP %i to throttled', async status => {
    expect(await fetcher(reply(status))('https://x.test/')).toEqual({
      ok: false,
      kind: 'throttled',
      message: `HTTP ${status}`,
    });
  });

  it('maps another error status to http', async () => {
    expect(await fetcher(reply(404))('https://x.test/')).toEqual({
      ok: false,
      kind: 'http',
      message: 'HTTP 404',
    });
  });

  it('maps a thrown error to network', async () => {
    const fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('Network request failed'));
    expect(await fetcher(fetch)('https://x.test/')).toEqual({
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
    expect(await fetcher(fetch, 10)('https://x.test/')).toEqual({
      ok: false,
      kind: 'timeout',
      message: 'no answer in 10 ms',
    });
  });

  it('merges extra headers with the User-Agent', async () => {
    const fetch = reply(200);
    await fetcher(fetch)('https://x.test/', {'Api-User-Agent': 'a'});
    expect(fetch.mock.calls[0][1].headers).toEqual({
      'User-Agent': 'Ink2Pic/test',
      'Api-User-Agent': 'a',
    });
  });
});
