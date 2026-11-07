import {NativeModules} from 'react-native';
import {logLines} from '../src/log/memory';
import {
  defaultSettings,
  parseSettings,
  serializeSettings,
} from '../src/settings/settings';
import {settingsPath} from '../src/storage/paths';
import {
  getSettings,
  loadSettings,
  resetSettingsForTests,
  saveSettings,
} from '../src/storage/settings';
import type {TextStorage} from '../src/storage/text';

function memory(files: Record<string, string> = {}): TextStorage {
  return {
    readText: async path => files[path] ?? null,
    writeText: async (path, text) => {
      files[path] = text;
    },
  };
}

describe('parseSettings (#68)', () => {
  it('gives the default for a missing file, with no problem', () => {
    expect(parseSettings(null, 'pt')).toEqual({
      settings: {languages: ['pt', 'en']},
      problems: [],
    });
  });

  it('gives the default for a malformed file, never an empty list', () => {
    for (const text of ['{not json', '[]', 'null', '{"languages": []}']) {
      const parsed = parseSettings(text, null);
      expect(parsed.settings).toEqual(defaultSettings(null));
      expect(parsed.problems.length).toBeGreaterThan(0);
    }
  });

  it('reads a valid file in its order', () => {
    const text = serializeSettings({languages: ['zh', 'es', 'en', 'pt']});
    expect(parseSettings(text, null)).toEqual({
      settings: {languages: ['zh', 'es', 'en', 'pt']},
      problems: [],
    });
  });

  it('ignores an unknown code, a duplicate and an unknown key, with a line each', () => {
    const text = JSON.stringify({
      version: 1,
      languages: ['es', 'xx', 'es', 3, 'en'],
      colour: 'red',
    });
    const parsed = parseSettings(text, null);
    expect(parsed.settings.languages).toEqual(['es', 'en']);
    expect(parsed.problems).toEqual([
      'settings: unknown key colour is ignored',
      'settings: language "xx" is ignored',
      'settings: language es is listed twice',
      'settings: language 3 is ignored',
    ]);
  });
});

describe('the settings file (#68)', () => {
  it('logs each problem of a hand-edited file', async () => {
    const path = '/s/settings.json';
    const storage = memory({[path]: '{"languages": ["en", "klingon"]}'});
    expect(await loadSettings(storage, path, null)).toEqual({
      languages: ['en'],
    });
    expect(logLines().join('\n')).toContain(
      'settings: language "klingon" is ignored',
    );
  });

  it('logs a failed read and uses the default', async () => {
    const storage: TextStorage = {
      readText: async () => {
        throw new Error('EACCES');
      },
      writeText: async () => {},
    };
    expect(await loadSettings(storage, '/x', null)).toEqual({
      languages: ['en'],
    });
    expect(logLines().join('\n')).toContain('settings: cannot read /x');
  });

  it('keeps the new order across a restart, written to MyStyle/Ink2Pic', async () => {
    const files: Record<string, string> = {};
    NativeModules.Ink2PicFiles = {
      readText: jest.fn(async (path: string) => files[path] ?? null),
      writeText: jest.fn(async (path: string, text: string) => {
        files[path] = text;
        return null;
      }),
    };
    resetSettingsForTests();
    expect((await getSettings()).languages).toEqual(['en']);
    await saveSettings({languages: ['pt', 'en']});
    expect(settingsPath()).toBe(
      '/storage/emulated/0/MyStyle/Ink2Pic/settings.json',
    );
    expect(Object.keys(files)).toEqual([settingsPath()]);
    // A new runtime reads the file again.
    resetSettingsForTests();
    expect((await getSettings()).languages).toEqual(['pt', 'en']);
    delete NativeModules.Ink2PicFiles;
  });
});

describe('reset groups (interface standard rule 12)', () => {
  it('puts every configurable key in a group that docs/feature-defaults.md names', () => {
    const {readFileSync} = jest.requireActual('fs');
    const {join} = jest.requireActual('path');
    const doc: string = readFileSync(
      join(__dirname, '..', 'docs', 'feature-defaults.md'),
      'utf8',
    );
    const {RESET_GROUPS} = jest.requireActual('../src/settings/settings');
    const keys = Object.keys(defaultSettings(null));
    expect(Object.keys(RESET_GROUPS).sort()).toEqual(keys.sort());
    for (const group of Object.values(RESET_GROUPS)) {
      expect(doc).toContain(`reset group «${group}»`);
    }
  });
});
