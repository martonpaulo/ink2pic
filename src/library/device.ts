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

const storage: TextStorage = {
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

async function libraryPath(): Promise<Result<string>> {
  const paths = await sessionPaths();
  return paths.ok ? ok(`${paths.value.pluginDir}/library.json`) : paths;
}

/** The library, loaded once; an unreadable file is reported and the library starts empty. */
export async function getLibrary(): Promise<Library> {
  if (current) {
    return current;
  }
  const path = await libraryPath();
  if (!path.ok) {
    log(`library: no path: ${path.message}`);
    current = emptyLibrary();
    return current;
  }
  try {
    const loaded = await logged('loadLibrary', () =>
      loadLibrary(storage, path.value).then(parsed =>
        parsed.ok ? ok(parsed.library) : fail(-1, parsed.message),
      ),
    );
    current = loaded.ok ? loaded.value : emptyLibrary();
  } catch (error) {
    log(`library: read failed: ${String(error)}`);
    current = emptyLibrary();
  }
  return current;
}

async function save(next: Library): Promise<void> {
  current = next;
  const path = await libraryPath();
  if (!path.ok) {
    return;
  }
  await logged('saveLibrary', () =>
    saveLibrary(storage, path.value, next).then(
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
}
