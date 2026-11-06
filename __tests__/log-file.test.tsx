/** A fresh, bounded log at each opening, written once per call (#45). */
import React from 'react';
import {NativeModules} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {
  closeLogFileForTests,
  flushLogFile,
  openLogFile,
  startSession,
} from '../src/log/file';
import {
  canClosePlugin,
  log,
  logged,
  logLines,
  LOG_MAX_LINES,
  setAfterCall,
  startLog,
} from '../src/log/memory';
import {LOG_VIEW_LINES, LogView} from '../src/ui/LogView';

const LOG = '/s/MyStyle/Ink2Pic/logs/session.log';
const PREV = '/s/MyStyle/Ink2Pic/logs/session.prev.log';
const files: Record<string, string> = {};
const writes: {path: string; text: string}[] = [];
const native = {
  writeText: jest.fn(async (path: string, text: string) => {
    writes.push({path, text});
    files[path] = text;
    return null;
  }),
  readText: jest.fn(async (path: string) => files[path] ?? null),
};
const answer = async () => ({ok: true as const, value: {width: 1920}});

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  for (const key of Object.keys(files)) {
    delete files[key];
  }
  writes.length = 0;
  NativeModules.Ink2PicFiles = native;
  closeLogFileForTests();
  startLog();
  openLogFile('/s/MyStyle/Ink2Pic/logs');
  setAfterCall(flushLogFile);
});
afterEach(() => {
  setAfterCall(() => {});
  closeLogFileForTests();
  jest.restoreAllMocks();
});

/** Lets every queued write finish, adding none. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('flushes', () => {
  it('writes an ordinary call once, after its answer', async () => {
    await logged('getPageSize', answer);
    await settle();
    expect(writes.filter(w => w.path === LOG)).toHaveLength(1);
    expect(files[LOG]).toMatch(/getPageSize -> ok/);
  });

  it('writes a call that can close the plugin before it starts', async () => {
    let seenBefore = '';
    await logged('closePluginView', async () => {
      seenBefore = writes.map(w => w.text).join('');
      return {ok: true as const, value: true};
    });
    expect(seenBefore).toMatch(/closePluginView …/);
    expect(canClosePlugin('insertImage(/a.png)')).toBe(true);
    expect(canClosePlugin('getLassoRect')).toBe(false);
  });

  it('joins flushes that arrive while a write runs into one write of the newest lines', async () => {
    let release: (value: null) => void = () => {};
    native.writeText.mockImplementationOnce(async (path, text) => {
      writes.push({path, text});
      return new Promise<null>(resolve => (release = resolve));
    });
    log('a');
    flushLogFile();
    await settle();
    log('b');
    flushLogFile();
    log('c');
    flushLogFile();
    release(null);
    await settle();
    expect(writes).toHaveLength(2);
    expect(writes[1].text).toBe(logLines().join('\n') + '\n');
  });

  it('keeps at most LOG_MAX_LINES lines in memory', () => {
    for (let i = 0; i < LOG_MAX_LINES + 5; i++) {
      log(`line ${i}`);
    }
    const lines = logLines();
    expect(lines).toHaveLength(LOG_MAX_LINES);
    expect(lines[lines.length - 1]).toMatch(/line 2004$/);
  });
});

describe('openings', () => {
  it('keeps the registrations and the last runtime file at the first opening', async () => {
    files[LOG] = 'last runtime';
    log('init: ok');
    await startSession();
    expect(files[PREV]).toBe('last runtime');
    expect(files[LOG]).toMatch(/init: ok/);
  });

  it('starts each later opening with an empty log and keeps the last one apart', async () => {
    await startSession();
    log('first opening');
    await startSession();
    log('second opening');
    await flushLogFile();
    expect(files[PREV]).toMatch(/first opening/);
    expect(files[LOG]).not.toMatch(/first opening/);
    expect(files[LOG]).toMatch(/second opening/);
  });

  it('moves every line before a later opening to the last one, a press too (#58)', async () => {
    await startSession();
    log('first opening');
    log('button 200 (live)');
    await startSession();
    await settle();
    expect(files[PREV]).toMatch(/first opening\n.*button 200 \(live\)\n$/);
    expect(logLines()).toEqual([]);
  });

  it('writes about the same at the tenth opening as at the first', async () => {
    const perOpening: number[] = [];
    for (let opening = 0; opening < 10; opening++) {
      const before = writes.length;
      await startSession();
      for (let call = 0; call < 25; call++) {
        await logged(`call ${call}`, answer);
      }
      await settle();
      perOpening.push(
        writes
          .slice(before)
          .filter(w => w.path === LOG)
          .reduce((sum, w) => sum + w.text.length, 0),
      );
    }
    // Before #45 the tenth opening wrote ten times the first, twice per call.
    expect(perOpening[9]).toBeLessThan(perOpening[1] * 1.5);
  });
});

it('shows the newest lines, newest at the bottom', () => {
  for (let i = 0; i < LOG_VIEW_LINES + 10; i++) {
    log(`line ${i}`);
  }
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<LogView />);
  });
  const text = String(tree.root.findByProps({testID: 'log'}).props.children);
  const shown = text.split('\n');
  expect(shown).toHaveLength(LOG_VIEW_LINES);
  expect(shown[shown.length - 1]).toMatch(/line 49$/);
  act(() => tree.unmount());
});
