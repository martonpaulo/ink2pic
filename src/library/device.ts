/**
 * The library on the device (#14, #15): library.json in the private plugin folder (brief section
 * 6.6), read once per session and saved after each change.
 */
import {sessionPaths} from '../flow/session';
import {log, logged} from '../log/memory';
import {fail, ok, Result} from '../sdk/result';
import {readText, writeText} from '../storage/files';
import {addItem, addRecentSearch, emptyLibrary} from './library';
import {loadLibrary, saveLibrary} from './store';
import type {Library, LibraryItem, TextStorage} from './types';

/** Text files through the Ink2PicFiles module, for every store on the device (DRY). */
export const deviceStorage: TextStorage = {
  readText: async path => {
    const text = await readText(path);
    if (!text.ok) {
      throw new Error(text.message);
    }
    return text.value;
  },
  writeText: async (path, text) => {
    const written = await writeText(path, text);
    if (!written.ok) {
      throw new Error(written.message);
    }
  },
};

let current: Library | null = null;
/**
 * False while library.json could not be read: the screen shows an empty library, but nothing is
 * saved over a file that may still hold the owner's pictures (review of build 0.1.0 (8), #33).
 */
let writable = false;

async function libraryPath(): Promise<Result<string>> {
  const paths = await sessionPaths();
  return paths.ok ? ok(`${paths.value.pluginDir}/library.json`) : paths;
}

/** The library, loaded once; an unreadable file is reported, shown empty, and never overwritten. */
export async function getLibrary(): Promise<Library> {
  if (current && writable) {
    return current;
  }
  const path = await libraryPath();
  if (!path.ok) {
    log(`library: no path: ${path.message}`);
    current = emptyLibrary();
    return current;
  }
  const loaded = await logged('loadLibrary', () =>
    loadLibrary(deviceStorage, path.value).then(
      parsed => (parsed.ok ? ok(parsed.library) : fail(-1, parsed.message)),
      error => fail(-1, String(error)),
    ),
  );
  writable = loaded.ok;
  current = loaded.ok ? loaded.value : emptyLibrary();
  if (!loaded.ok) {
    log('library: not saved this session, so the file on the device is kept');
  }
  return current;
}

async function save(next: Library): Promise<void> {
  current = next;
  const path = await libraryPath();
  if (!path.ok || !writable) {
    return;
  }
  await logged('saveLibrary', () =>
    saveLibrary(deviceStorage, path.value, next).then(
      () => ok(true),
      error => fail(-1, String(error)),
    ),
  );
}

export async function recordInsert(item: LibraryItem): Promise<void> {
  await save(addItem(await getLibrary(), item));
}

export async function recordSearch(query: string): Promise<void> {
  await save(addRecentSearch(await getLibrary(), query));
}

export function resetLibraryForTests(): void {
  current = null;
  writable = false;
}
