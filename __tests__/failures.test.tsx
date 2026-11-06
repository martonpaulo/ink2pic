/**
 * Every failure in the flow reaches a visible message (#19, brief section 8.8): one sentence
 * with the cause and the next step, never a code (#37).
 */
import React from 'react';
import {NativeModules, Text} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {PluginManager} from 'sn-plugin-lib';
import {
  EMPTY_LASSO_CODE,
  failureText,
  isOffline,
  Step,
} from '../src/flow/failure';
import {TIMEOUT_CODE} from '../src/log/memory';
import type {Source} from '../src/search/search';
import type {SourceOutcome} from '../src/sources/types';
import {copy} from '../src/ui/copy';
import {SearchScreen} from '../src/ui/SearchScreen';

const source = (name: string, outcome: SourceOutcome): Source => ({
  name,
  search: () => Promise.resolve(outcome),
});

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  delete NativeModules.Ink2PicFiles;
});
afterEach(() => jest.restoreAllMocks());

async function render(sources: Source[], props: {lassoFailed?: boolean} = {}) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SearchScreen
        initialQuery={props.lassoFailed ? '' : 'soup'}
        lassoFailure={
          props.lassoFailed
            ? {ok: false, code: 117, message: 'bad size', step: 'lasso'}
            : null
        }
        onPick={jest.fn()}
        onClose={jest.fn()}
        sources={sources}
      />,
    );
  });
  return tree;
}
const texts = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(t => t.props.children);

describe('visible failures (#19)', () => {
  it('no network: says so and opens the library', async () => {
    const tree = await render([
      source('a', {
        ok: false,
        kind: 'network',
        message: 'Network request failed',
      }),
      source('b', {ok: false, kind: 'timeout', message: 'no answer'}),
    ]);
    expect(texts(tree)).toEqual(
      expect.arrayContaining([copy['error.offline'], copy['library.empty']]),
    );
    act(() => tree.unmount());
  });

  it('a search with no network and no INTERNET permission names the permission', async () => {
    (PluginManager.hasPermission as jest.Mock).mockResolvedValue(0);
    const tree = await render([
      source('a', {
        ok: false,
        kind: 'network',
        message: 'Network request failed',
      }),
    ]);
    expect(texts(tree)).toContain(
      `${copy['error.permission.internet']} ${copy['error.permission.settings']}`,
    );
    act(() => tree.unmount());
  });

  it('one source down and nothing found: names the failure', async () => {
    const tree = await render([
      source('a', {ok: false, kind: 'throttled', message: 'HTTP 429'}),
      source('b', {ok: true, results: []}),
    ]);
    expect(texts(tree)).toContain(copy['error.sourceDown']);
    act(() => tree.unmount());
  });

  it('recognition failed: says to type the word', async () => {
    const tree = await render([], {lassoFailed: true});
    expect(texts(tree)).toContain(copy['error.recognition']);
    act(() => tree.unmount());
  });

  it('tells offline from a source error', () => {
    const statuses = {
      a: {state: 'failed' as const, kind: 'http' as const, message: 'HTTP 500'},
    };
    expect(
      isOffline({results: [], statuses, sourceDown: false, allFailed: true}),
    ).toBe(false);
  });

  it('both sources down: says so, not that nothing was found', async () => {
    const tree = await render([
      source('a', {ok: false, kind: 'http', message: 'HTTP 500'}),
      source('b', {ok: false, kind: 'throttled', message: 'HTTP 429'}),
    ]);
    expect(texts(tree)).toContain(copy['error.sourcesDown']);
    expect(texts(tree)).not.toContain(copy['search.empty']);
    act(() => tree.unmount());
  });

  it('no picture found: says to try a simpler word', async () => {
    const tree = await render([source('a', {ok: true, results: []})]);
    expect(texts(tree)).toContain(copy['search.empty']);
    act(() => tree.unmount());
  });
});

const at = (step: Step, code: number, message: string) =>
  failureText({ok: false, code, message, step});
const sentence = (...keys: (keyof typeof copy)[]) =>
  keys.map(key => copy[key]).join(' ');

describe('the sentence for each failure (#37)', () => {
  it.each([
    [
      'the internet dropped during the download',
      at(
        'download',
        -2,
        'IO: java.net.UnknownHostException: Unable to resolve host',
      ),
      sentence('error.downloadOffline'),
    ],
    [
      'a download that hit the call limit',
      at('download', TIMEOUT_CODE, 'TIMEOUT: no answer in 20000 ms'),
      sentence('error.downloadOffline'),
    ],
    [
      'the internet permission is missing',
      at(
        'download',
        -2,
        'IO: java.net.SocketException: socket failed: EACCES (Permission denied)',
      ),
      sentence('error.permission.internet', 'error.permission.settings'),
    ],
    [
      'the internet permission is missing at the host lookup',
      at(
        'download',
        -2,
        'IO: java.net.UnknownHostException: Unable to resolve host "openclipart.org": android_getaddrinfo failed: EACCES (Permission denied)',
      ),
      sentence('error.permission.internet', 'error.permission.settings'),
    ],
    [
      'the file permission is missing at the download',
      at(
        'download',
        -2,
        'IO: java.io.FileNotFoundException: open failed: EACCES (Permission denied)',
      ),
      sentence('error.permission.files', 'error.permission.settings'),
    ],
    [
      'the file permission is missing at the lasso (1503)',
      at('lasso', 1503, 'no FILE:READ'),
      sentence('error.permission.files', 'error.permission.settings'),
    ],
    [
      'the file permission is missing at the insert (1503)',
      at('place', 1503, 'no FILE:WRITE'),
      sentence('error.permission.files', 'error.permission.settings'),
    ],
    [
      'the storage is full',
      at(
        'download',
        -2,
        'IO: java.io.IOException: write failed: ENOSPC (No space left on device)',
      ),
      sentence('error.save'),
    ],
    [
      'the folder cannot be written',
      at('download', -2, 'IO: java.io.IOException: cannot create folder /x'),
      sentence('error.save'),
    ],
    [
      'the source refused the picture',
      at('download', -2, 'HTTP_503: HTTP 503 for https://x'),
      sentence('error.download'),
    ],
    [
      'the handwriting could not be read',
      at('lasso', 117, 'bad size'),
      sentence('error.recognition'),
    ],
    [
      'nothing was lassoed',
      at('lasso', EMPTY_LASSO_CODE, 'the lasso holds no handwriting'),
      sentence('error.emptyLasso'),
    ],
    [
      'the picture could not be placed',
      at('place', 107, 'bad element'),
      sentence('error.place'),
    ],
    [
      'an unexpected error',
      at('download', -2, 'MISSING: Ink2PicFiles is not loaded'),
      sentence('error.unexpected'),
    ],
  ])('%s', (_, shown, expected) => {
    expect(shown).toBe(expected);
    expect(shown).not.toMatch(/\d{3}|EACCES|java/);
  });
});
