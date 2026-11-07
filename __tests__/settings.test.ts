import {NativeModules} from 'react-native';
import {logLines} from '../src/log/memory';
import {
  defaultSettings,
  parseSettings,
  serializeSettings,
  styleFlags,
} from '../src/settings/settings';
import {settingsPath} from '../src/storage/paths';
import {
  getSettings,
  loadSettings,
  resetSettingsForTests,
  saveSettings,
} from '../src/storage/settings';
import type {TextStore} from '../src/search-core';

function memory(files: Record<string, string> = {}): TextStore {
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
      settings: {...defaultSettings(null), languages: ['pt', 'en']},
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
    const saved = {
      ...defaultSettings(null),
      languages: ['zh', 'es', 'en', 'pt'] as const,
      placement: 'beside' as const,
      sourcesOff: ['commons'],
      dataSaver: true,
    };
    expect(parseSettings(serializeSettings(saved), null)).toEqual({
      settings: saved,
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
    expect(
      (await loadSettings(storage, path, null)).settings.languages,
    ).toEqual(['en']);
    expect(logLines().join('\n')).toContain(
      'settings: language "klingon" is ignored',
    );
  });

  it('logs a failed read and uses the default', async () => {
    const storage: TextStore = {
      readText: async () => {
        throw new Error('EACCES');
      },
      writeText: async () => {},
    };
    expect(await loadSettings(storage, '/x', null)).toEqual({
      settings: defaultSettings(null),
      readFailure: 'Error: EACCES',
    });
    expect(logLines().join('\n')).toContain('settings: cannot read /x');
  });

  it('never writes the defaults over a file it could not read (#99)', async () => {
    const file = serializeSettings({...defaultSettings(null), size: 'large'});
    const writeText = jest.fn(async () => null);
    NativeModules.Ink2PicFiles = {
      readText: jest.fn(async () => {
        throw Object.assign(new Error('busy'), {code: 'IO'});
      }),
      writeText,
    };
    resetSettingsForTests();
    expect((await getSettings()).size).toBe('medium');
    await saveSettings({...defaultSettings(null), placement: 'beside'});
    // The change lasts for the session; the file keeps the person's settings.
    expect((await getSettings()).placement).toBe('beside');
    expect(writeText).not.toHaveBeenCalled();
    expect(logLines().join('\n')).toContain(
      'settings: cannot read /storage/emulated/0/MyStyle/Ink2Pic/settings.json: IO: busy',
    );
    expect(logLines().join('\n')).toContain('settings: not saved');
    // The next runtime reads the file again and saves as before.
    NativeModules.Ink2PicFiles.readText = jest.fn(async () => file);
    resetSettingsForTests();
    expect((await getSettings()).size).toBe('large');
    await saveSettings({...defaultSettings(null), size: 'small'});
    expect(writeText).toHaveBeenCalledTimes(1);
    delete NativeModules.Ink2PicFiles;
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
    await saveSettings({...defaultSettings(null), languages: ['pt', 'en']});
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

describe('styleFlags (#99)', () => {
  it('reads each style once, for the search, the measures and the insert', () => {
    const flags = (style: 'drawings' | 'photos' | 'contour') =>
      styleFlags({...defaultSettings(null), style});
    expect(flags('drawings')).toEqual({photos: false, contour: false});
    expect(flags('photos')).toEqual({photos: true, contour: false});
    expect(flags('contour')).toEqual({photos: false, contour: true});
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

describe('settingsStep (#70)', () => {
  const start = defaultSettings(null);
  const {settingsStep, SOURCE_NAMES} = jest.requireActual(
    '../src/settings/settings',
  ) as typeof import('../src/settings/settings');

  it('keeps today’s behaviour as every default', () => {
    expect(start).toEqual({
      languages: ['en'],
      size: 'medium',
      placement: 'below',
      style: 'drawings',
      spacing: 'normal',
      sourcesOff: [],
      dataSaver: false,
    });
  });

  it('chooses a known value and ignores an unknown one', () => {
    expect(
      settingsStep(start, {type: 'choose', key: 'size', value: 'large'}).size,
    ).toBe('large');
    expect(
      settingsStep(start, {type: 'choose', key: 'size', value: 'huge'}),
    ).toBe(start);
  });

  it('turns sources off and on, but never the last one', () => {
    let next = start;
    for (const name of SOURCE_NAMES) {
      next = settingsStep(next, {type: 'source', name, on: false});
    }
    expect(next.sourcesOff).toEqual(SOURCE_NAMES.slice(0, -1));
    next = settingsStep(next, {
      type: 'source',
      name: SOURCE_NAMES[0],
      on: true,
    });
    expect(next.sourcesOff).toEqual(SOURCE_NAMES.slice(1, -1));
  });

  it('Reset restores every default', () => {
    let changed = start;
    const actions: Parameters<typeof settingsStep>[1][] = [
      {type: 'languages', action: {type: 'add', code: 'zh'}},
      {type: 'choose', key: 'size', value: 'small'},
      {type: 'choose', key: 'placement', value: 'replace'},
      {type: 'choose', key: 'style', value: 'contour'},
      {type: 'choose', key: 'spacing', value: 'tight'},
      {type: 'source', name: SOURCE_NAMES[0], on: false},
      {type: 'dataSaver', on: true},
    ];
    for (const action of actions) {
      changed = settingsStep(changed, action);
    }
    // Every key changed, so the reset below restores each one.
    for (const key of Object.keys(start) as (keyof typeof start)[]) {
      expect(changed[key]).not.toEqual(start[key]);
    }
    expect(settingsStep(changed, {type: 'reset', system: null})).toEqual(start);
    expect(settingsStep(changed, {type: 'reset', system: 'es'})).toEqual(
      defaultSettings('es'),
    );
  });

  it('ignores unknown values of a hand-edited file, with a line each', () => {
    const parsed = parseSettings(
      JSON.stringify({
        size: 'huge',
        dataSaver: 'yes',
        sourcesOff: ['nowhere', SOURCE_NAMES[0]],
      }),
      null,
    );
    expect(parsed.settings).toEqual({
      ...start,
      sourcesOff: [SOURCE_NAMES[0]],
    });
    expect(parsed.problems).toEqual([
      'settings: size "huge" is ignored; the default is used',
      'settings: source "nowhere" is ignored',
      'settings: dataSaver "yes" is ignored; the default is used',
    ]);
  });

  it('never reads every source off', () => {
    const parsed = parseSettings(
      JSON.stringify({sourcesOff: SOURCE_NAMES}),
      null,
    );
    expect(parsed.settings.sourcesOff).toEqual([]);
  });
});
