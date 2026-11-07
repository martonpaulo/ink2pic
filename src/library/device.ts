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
/** True once library.json was found unreadable this session: the Library page says so (#104). */
let unreadable = false;

const LIBRARY_FILE = 'library.json';
/** Where an unreadable library.json is kept, beside it: `library.unreadable-<ms>.json` (#104). */
const UNREADABLE_PREFIX = 'library.unreadable-';
/** The rebuild from the folder is checked once per session. */
let rebuildChecked = false;
/** A prepared picture: `<source>-<source id>.png`, as insertPicture names it. */
const PICTURE_FILE = /^(openclipart|commons|openmoji)-([^.]+)(\.contour)?\.png$/;
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
  openmoji: {license: 'CC BY-SA 4.0', attribution: 'OpenMoji'},
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
        contour: match[3] !== undefined,
      },
    ];
  });
}

/** The library the pictures in the folder stand for; empty when the folder cannot be listed. */
async function libraryFromFolder(): Promise<Library> {
  const names = await logged('listDir library', () => listDir(libraryDir()));
  const items =
    names.ok && names.value ? itemsFromFiles(libraryDir(), names.value) : [];
  return items.reduce(addItem, emptyLibrary());
}

/** Writes library.json from the pictures in the folder when the file does not exist (#61). */
async function rebuildFromFolder(shared: string): Promise<void> {
  const existing = await readText(shared);
  if (!existing.ok || existing.value !== null) {
    return;
  }
  const library = await libraryFromFolder();
  if (library.items.length === 0) {
    return;
  }
  await logged(
    `rebuild ${LIBRARY_FILE} from ${library.items.length} pictures`,
    () => writeText(shared, serialize(library)),
  );
}

/**
 * An unreadable library.json (#104): its text is first written beside it under another name, in
 * place and with no delete (#62), then library.json is rebuilt from the folder. When the copy
 * cannot be written, nothing is saved this session, so the file on the device is kept.
 */
async function recoverUnreadable(shared: string): Promise<Library> {
  writable = false;
  const text = await logged(`read unreadable ${LIBRARY_FILE}`, () =>
    readText(shared),
  );
  if (!text.ok || text.value === null) {
    return emptyLibrary();
  }
  const aside = `${libraryDir()}/${UNREADABLE_PREFIX}${Date.now()}.json`;
  const kept = await logged(`keep unreadable ${LIBRARY_FILE} as ${aside}`, () =>
    writeText(aside, text.value as string),
  );
  if (!kept.ok) {
    return emptyLibrary();
  }
  const library = await libraryFromFolder();
  const rebuilt = await logged(
    `rebuild ${LIBRARY_FILE} from ${library.items.length} pictures`,
    () => writeText(shared, serialize(library)),
  );
  writable = rebuilt.ok;
  return library;
}

/**
 * Whether library.json was unreadable this session, for the Library page (#104): `rebuilt` from
 * the folder with the old file kept aside, `kept` as it is when its copy could not be written.
 */
export function libraryUnreadable(): 'rebuilt' | 'kept' | null {
  if (!unreadable) {
    return null;
  }
  return writable ? 'rebuilt' : 'kept';
}

/**
 * The library, loaded once. An unreadable file is reported, kept aside and rebuilt from the
 * folder; it is never overwritten before its copy is written (#104).
 */
export async function getLibrary(): Promise<Library> {
  if (current && (writable || unreadable)) {
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
  if (loaded.ok) {
    writable = true;
    current = loaded.value;
    return current;
  }
  unreadable = true;
  current = await recoverUnreadable(path.value);
  if (!writable) {
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

/**
 * Clears the library list and the recent searches, on the person's confirmed tap in Settings
 * (#70): library.json is written empty, so the folder is not listed again (#61). The picture files
 * stay in MyStyle/Ink2Pic/library: deleting them would need FILE:DELETE, which Ink2Pic does not
 * declare.
 */
export async function clearLibrary(): Promise<boolean> {
  const path = await libraryPath();
  if (!path.ok) {
    return false;
  }
  const written = await logged('clear library.json', () =>
    saveLibrary(deviceStorage, path.value, emptyLibrary()).then(
      () => ok(true),
      error => fail(THROWN_CODE, String(error)),
    ),
  );
  if (written.ok) {
    current = emptyLibrary();
    writable = true;
    unreadable = false;
  }
  return written.ok;
}

export function resetLibraryForTests(): void {
  current = null;
  writable = false;
  unreadable = false;
  rebuildChecked = false;
}
