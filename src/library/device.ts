/**
 * The library on the device (#14, #15): library.json beside the pictures in MyStyle/Ink2Pic/library,
 * so it survives a plugin update, which empties the private plugin folder (#41; brief section 6.6).
 * Read once per session and saved after each change; a search that changes nothing writes nothing
 * (#46).
 */
import {sessionPaths} from '../flow/session';
import {log, logged} from '../log/memory';
import {fail, ok, Result} from '../sdk/result';
import {
  deleteLibrarySource,
  listDir,
  readText,
  writeText,
} from '../storage/files';
import {libraryDir} from '../storage/paths';
import {addItem, addRecentSearch, emptyLibrary, serialize} from './library';
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

const LIBRARY_FILE = 'library.json';
/** `<id>.source.<ext>`: the raw download builds 0.1.0 (10) to (13) kept beside each picture. */
const OLD_SOURCE = /^[A-Za-z0-9_.-]+\.source\.[A-Za-z0-9]+$/;
/** The removal of those files, started once per session after the library loads. */
let oldSources: Promise<void> = Promise.resolve();
/** The move from the private folder is checked once per session. */
let moveChecked = false;

async function libraryPath(): Promise<Result<string>> {
  const paths = await sessionPaths();
  if (!paths.ok) {
    return paths;
  }
  const shared = `${libraryDir(paths.value.root)}/${LIBRARY_FILE}`;
  if (!moveChecked) {
    moveChecked = true;
    await moveFromPrivate(`${paths.value.pluginDir}/${LIBRARY_FILE}`, shared);
  }
  return ok(shared);
}

/**
 * Builds before 0.1.0 (13) kept library.json in the private folder: when the shared file does not
 * exist yet and the private one does, its text is copied over once (#41).
 */
async function moveFromPrivate(old: string, shared: string): Promise<void> {
  const existing = await readText(shared);
  if (!existing.ok || existing.value !== null) {
    return;
  }
  const previous = await readText(old);
  if (previous.ok && previous.value !== null) {
    await logged(`move ${LIBRARY_FILE} to ${shared}`, () =>
      writeText(shared, previous.value as string),
    );
  }
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
  } else if (!current.sourcesRemoved) {
    // Not awaited: the person's library and search never wait for it.
    oldSources = removeOldSources(path.value.replace(/\/[^/]+$/, ''));
  }
  return current;
}

/**
 * Removes the .source files older builds left in the library folder, once per install (#57): the
 * flag is saved in library.json only when every delete succeeded, so a failure is tried again in
 * the next session. A file the library names is kept, since an old insert may point to it.
 */
async function removeOldSources(dir: string): Promise<void> {
  const names = await logged(`listDir ${dir}`, () => listDir(dir));
  if (!names.ok) {
    return;
  }
  const kept = new Set((await getLibrary()).items.map(item => item.path));
  const paths = (names.value ?? [])
    .filter(name => OLD_SOURCE.test(name))
    .map(name => `${dir}/${name}`)
    .filter(path => !kept.has(path));
  let bytes = 0;
  let failed = 0;
  for (const path of paths) {
    const freed = await deleteLibrarySource(path);
    if (freed.ok) {
      bytes += freed.value;
    } else {
      failed += 1;
      log(`library: cannot delete ${path}: ${freed.message}`);
    }
  }
  log(
    `library: removed ${
      paths.length - failed
    } old .source files, ${bytes} bytes freed`,
  );
  if (failed === 0) {
    await save({...(await getLibrary()), sourcesRemoved: true});
  }
}

async function save(next: Library): Promise<void> {
  if (current && (next === current || serialize(next) === serialize(current))) {
    return;
  }
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

/** The removal of the old .source files this session started, for tests. */
export function oldSourcesRemovedForTests(): Promise<void> {
  return oldSources;
}

export function resetLibraryForTests(): void {
  oldSources = Promise.resolve();
  current = null;
  writable = false;
  moveChecked = false;
}
