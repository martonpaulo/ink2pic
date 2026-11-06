/**
 * The library on the device (#14, #15): library.json beside the pictures in MyStyle/Ink2Pic/library,
 * so it survives a plugin update, which empties the private plugin folder (#41; brief section 6.6).
 * Read once per session and saved after each change; a search that changes nothing writes nothing
 * (#46).
 */
import {log, logged} from '../log/memory';
import {fail, ok, Result, THROWN_CODE} from '../sdk/result';
import {listDir, readText, writeText} from '../storage/files';
import {libraryDir} from '../storage/paths';
import {deviceStorage} from '../storage/text';
import {addItem, addRecentSearch, emptyLibrary, serialize} from './library';
import {loadLibrary, saveLibrary} from './store';
import type {SourceName} from '../search-core';
import type {Library, LibraryItem} from './types';

let current: Library | null = null;
/**
 * False while library.json could not be read: the screen shows an empty library, but nothing is
 * saved over a file that may still hold the owner's pictures (review of build 0.1.0 (8), #33).
 */
let writable = false;

const LIBRARY_FILE = 'library.json';
/** The rebuild from the folder is checked once per session. */
let rebuildChecked = false;
/** A prepared picture: `<source>-<source id>.png`, as insertPicture names it. */
const PICTURE_FILE = /^(openclipart|commons)-([^.]+)\.png$/;
/** What the file name cannot tell about a picture from an older build. */
const UNKNOWN = 'unknown';
/** One second apart: rebuilt items keep the folder's order, which stands in for their dates. */
const REBUILT_STEP_MS = 1000;
const KNOWN_LICENSES: Record<
  SourceName,
  {license: string; attribution: string}
> = {
  openclipart: {license: 'CC0 1.0', attribution: 'Openclipart'},
  commons: {license: UNKNOWN, attribution: 'Wikimedia Commons'},
};

async function libraryPath(): Promise<Result<string>> {
  const shared = `${libraryDir()}/${LIBRARY_FILE}`;
  if (!rebuildChecked) {
    rebuildChecked = true;
    await rebuildFromFolder(shared);
  }
  return ok(shared);
}

/**
 * The items a list of library file names stands for, oldest first as the folder lists them. Older
 * builds kept library.json in the private folder, which an install empties: their pictures stay in
 * MyStyle/Ink2Pic/library, so they are listed again from their names (#61).
 */
export function itemsFromFiles(
  dir: string,
  names: readonly string[],
): LibraryItem[] {
  return names.flatMap((name, index) => {
    const match = PICTURE_FILE.exec(name);
    if (!match) {
      return [];
    }
    const source = match[1] as SourceName;
    return [
      {
        id: `${source}:${match[2]}`,
        source,
        sourceId: match[2],
        sourceUrl: '',
        query: '',
        ...KNOWN_LICENSES[source],
        // The folder gives no dates: the order stands in for them.
        savedAt: new Date(index * REBUILT_STEP_MS).toISOString(),
        path: `${dir}/${name}`,
        width: null,
        height: null,
      },
    ];
  });
}

/** Writes library.json from the pictures in the folder when the file does not exist (#61). */
async function rebuildFromFolder(shared: string): Promise<void> {
  const existing = await readText(shared);
  if (!existing.ok || existing.value !== null) {
    return;
  }
  const names = await logged('listDir library', () => listDir(libraryDir()));
  if (!names.ok || !names.value) {
    return;
  }
  const items = itemsFromFiles(libraryDir(), names.value);
  if (items.length === 0) {
    return;
  }
  const library = items.reduce(addItem, emptyLibrary());
  await logged(`rebuild ${LIBRARY_FILE} from ${items.length} pictures`, () =>
    writeText(shared, serialize(library)),
  );
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
      parsed =>
        parsed.ok ? ok(parsed.library) : fail(THROWN_CODE, parsed.message),
      error => fail(THROWN_CODE, String(error)),
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
      error => fail(THROWN_CODE, String(error)),
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
  rebuildChecked = false;
}
