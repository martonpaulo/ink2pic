import {readdirSync, readFileSync, statSync} from 'fs';
import {join, relative} from 'path';
import {NativeModules} from 'react-native';
import {crashReport} from '../src/flow/crash';
import {listDir} from '../src/storage/files';

describe('crash report (#13)', () => {
  it('carries the message, the stack start and the last log lines', () => {
    const error = new Error('boom');
    const text = crashReport(error, true, ['a', 'b']);
    expect(text.split('\n')[0]).toBe('Ink2Pic error (fatal): boom');
    expect(text).toMatch(/\na\nb$/);
  });
});

describe('listDir (#13)', () => {
  it('answers null for a missing folder, through the plugin module', async () => {
    NativeModules.Ink2PicFiles = {listDir: jest.fn().mockResolvedValue(null)};
    expect(await listDir('/p/thumbs')).toEqual({ok: true, value: null});
  });
});

/**
 * FileUtils' module can make the host close the plugin on an error (build 0.1.0 (9)): product
 * code reaches files only through the plugin's own module. Only the wrappers and tests may name
 * the FileUtils wrappers.
 */
it('keeps product code off the FileUtils wrappers', () => {
  const root = join(__dirname, '..', 'src');
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap(name => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });
  const offenders = files(root).filter(
    path =>
      !relative(root, path).startsWith('sdk/') &&
      /from '[./]*sdk\/files'/.test(readFileSync(path, 'utf8')),
  );
  expect(offenders.map(path => relative(root, path))).toEqual([]);
});
