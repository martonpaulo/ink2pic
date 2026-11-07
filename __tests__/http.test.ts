import {createFetcher, FetchLike} from '../src/search-core/fetcher';

const reply = (status: number, body = '') =>
  jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
  });
const fetcher = (fetch: FetchLike, timeoutMs?: number) =>
  createFetcher({fetch, userAgent: 'Ink2Pic/test', timeoutMs});

afterEach(() => jest.useRealTimers());

describe('createFetcher', () => {
  it('returns the body', async () => {
    expect(await fetcher(reply(200, 'hi'))('https://x.test/')).toEqual({
      ok: true,
      value: 'hi',
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
    jest.useFakeTimers();
    const fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('Network request failed'));
    const pending = fetcher(fetch)('https://x.test/');
    await jest.advanceTimersByTimeAsync(400);
    expect(await pending).toEqual({
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

describe('one retry within the budget (#65)', () => {
  const answers = (...statuses: (number | Error)[]) => {
    const fetch = jest.fn();
    for (const answer of statuses) {
      if (answer instanceof Error) {
        fetch.mockRejectedValueOnce(answer);
      } else {
        fetch.mockResolvedValueOnce({
          ok: answer < 300,
          status: answer,
          text: () => Promise.resolve('body'),
        });
      }
    }
    return fetch;
  };

  it.each([429, 500, 503])(
    'tries HTTP %i once more after 400 ms',
    async status => {
      jest.useFakeTimers();
      const fetch = answers(status, 200);
      const lines: string[] = [];
      const get = createFetcher({
        fetch,
        userAgent: 'Ink2Pic/test',
        log: line => lines.push(line),
      });
      const pending = get('https://x.test/');
      await jest.advanceTimersByTimeAsync(399);
      expect(fetch).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      expect(await pending).toEqual({ok: true, value: 'body'});
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(lines).toEqual([
        `request https://x.test/: HTTP ${status}; retrying in 400 ms`,
      ]);
    },
  );

  it('tries a network error once more', async () => {
    jest.useFakeTimers();
    const fetch = answers(new TypeError('Network request failed'), 200);
    const pending = fetcher(fetch)('https://x.test/');
    await jest.advanceTimersByTimeAsync(400);
    expect(await pending).toEqual({ok: true, value: 'body'});
  });

  it('gives up after the second failure, with its kind', async () => {
    jest.useFakeTimers();
    const fetch = answers(503, 429);
    const pending = fetcher(fetch)('https://x.test/');
    await jest.advanceTimersByTimeAsync(400);
    expect(await pending).toEqual({
      ok: false,
      kind: 'throttled',
      message: 'HTTP 429',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([403, 404])('never retries HTTP %i', async status => {
    const fetch = answers(status, 200);
    expect((await fetcher(fetch)('https://x.test/')).ok).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries only while the budget has room, and the retry ends with it', async () => {
    jest.useFakeTimers();
    // The first answer takes 4.8 s of a 5 s budget: no time for a 400 ms pause.
    const late = jest.fn(
      () =>
        new Promise(resolve =>
          setTimeout(
            () => resolve({ok: false, status: 503, text: jest.fn()}),
            4800,
          ),
        ),
    );
    const pending = fetcher(
      late as unknown as FetchLike,
      5000,
    )('https://x.test/');
    await jest.advanceTimersByTimeAsync(4800);
    expect(await pending).toEqual({
      ok: false,
      kind: 'http',
      message: 'HTTP 503',
    });
    expect(late).toHaveBeenCalledTimes(1);
  });
});
