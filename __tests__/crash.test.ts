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
 * FileUtils' module can make the host close the plugin on an error (build 0.1.0 (9)): its
 * `getExternalDirPath` reads the current activity with no null check (sn-plugin-lib 0.2.3, #34).
 * No code under src/ names FileUtils; files go through the plugin's own module.
 */
it('keeps every source file off FileUtils', () => {
  const root = join(__dirname, '..', 'src');
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap(name => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });
  // An import or a call; comments and the module-name list of the spike report may name it.
  const offenders = files(root).filter(path =>
    /import[^;]*\bFileUtils\b|\bFileUtils\.\w+\(/.test(
      readFileSync(path, 'utf8'),
    ),
  );
  expect(offenders.map(path => relative(root, path))).toEqual([]);
});

describe('the clean screen (#36)', () => {
  it('never writes an error into the note', () => {
    const source = readFileSync(
      join(__dirname, '..', 'src', 'flow', 'crash.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/insertText|sdk\/note/);
  });
});
