import {
  addItem,
  addRecentSearch,
  emptyLibrary,
  findItem,
  parseLibrary,
  RECENT_LIMIT,
  serialize,
} from '../src/library/library';
import {loadLibrary, saveLibrary} from '../src/library/store';
import type {LibraryItem} from '../src/library/types';
import type {TextStorage} from '../src/storage/text';

const item = (n: number, query = 'soup'): LibraryItem => ({
  id: `openclipart:${n}`,
  source: 'openclipart',
  sourceId: String(n),
  sourceUrl: `https://openclipart.org/detail/${n}`,
  query,
  license: 'CC0 1.0',
  attribution: 'Openclipart',
  savedAt: '2026-11-06T12:00:00.000Z',
  path: `/storage/emulated/0/MyStyle/Ink2Pic/library/openclipart-${n}.png`,
  width: 640,
  height: 593,
  contour: false,
});

function memoryStorage(files: Record<string, string> = {}): TextStorage {
  return {
    readText: async path => files[path] ?? null,
    writeText: async (path, text) => {
      files[path] = text;
    },
  };
}

describe('items', () => {
  it('adds newest first and finds by id', () => {
    const library = addItem(addItem(emptyLibrary(), item(1)), item(2));
    expect(library.items.map(i => i.id)).toEqual([
      'openclipart:2',
      'openclipart:1',
    ]);
    expect(findItem(library, 'openclipart:1', false)?.sourceId).toBe('1');
    expect(findItem(library, 'commons:9', false)).toBeUndefined();
  });

  it('replaces a duplicate and moves it to the front', () => {
    let library = addItem(addItem(emptyLibrary(), item(1)), item(2));
    library = addItem(library, item(1, 'bowl'));
    expect(library.items.map(i => i.id)).toEqual([
      'openclipart:1',
      'openclipart:2',
    ]);
    expect(library.items[0].query).toBe('bowl');
  });
});

describe('recent searches', () => {
  it('keeps the newest first, without duplicates, capped', () => {
    let library = emptyLibrary();
    for (const q of ['soup', 'wine', 'Soup ', '  ', 'beer']) {
      library = addRecentSearch(library, q);
    }
    expect(library.recentSearches).toEqual(['beer', 'Soup', 'wine']);
    for (let i = 0; i < RECENT_LIMIT + 3; i++) {
      library = addRecentSearch(library, `word ${i}`);
    }
    expect(library.recentSearches).toHaveLength(RECENT_LIMIT);
    expect(library.recentSearches[0]).toBe(`word ${RECENT_LIMIT + 2}`);
  });
});

describe('stored format', () => {
  it('round-trips through JSON with a version', () => {
    const library = addRecentSearch(addItem(emptyLibrary(), item(1)), 'soup');
    const text = serialize(library);
    expect(JSON.parse(text).version).toBe(1);
    expect(parseLibrary(text)).toEqual({ok: true, library});
  });

  it('reads an item saved before #103, with no style, as plain', () => {
    const old: Partial<LibraryItem> = {...item(1)};
    delete old.contour;
    const text = JSON.stringify({version: 1, items: [old], recentSearches: []});
    expect(parseLibrary(text)).toEqual({
      ok: true,
      library: {items: [item(1)], recentSearches: []},
    });
  });

  it('finds a picture only in the style asked for (#103)', () => {
    const library = addItem(emptyLibrary(), {...item(1), contour: true});
    expect(findItem(library, 'openclipart:1', true)).toBeDefined();
    expect(findItem(library, 'openclipart:1', false)).toBeUndefined();
  });

  it.each([
    [
      'a style that is not a boolean',
      '{"version":1,"items":[{"id":"x","source":"x","sourceId":"x","sourceUrl":"x","query":"x","license":"x","attribution":"x","savedAt":"x","path":"x","width":null,"height":null,"contour":"yes"}],"recentSearches":[]}',
      'a library item is malformed',
    ],
    ['not JSON', '{', 'the library file is not JSON'],
    [
      'an unknown version',
      '{"version":2,"items":[],"recentSearches":[]}',
      'unknown library version 2',
    ],
    [
      'a malformed item',
      '{"version":1,"items":[{"id":1}],"recentSearches":[]}',
      'a library item is malformed',
    ],
    [
      'malformed searches',
      '{"version":1,"items":[],"recentSearches":[3]}',
      'the recent searches are malformed',
    ],
  ])(
    'reports %s as a failure, not an empty library',
    (_name, text, message) => {
      expect(parseLibrary(text)).toEqual({ok: false, message});
    },
  );
});

describe('store', () => {
  const path = '/plugin/library.json';

  it('reads a missing file as an empty library', async () => {
    expect(await loadLibrary(memoryStorage(), path)).toEqual({
      ok: true,
      library: emptyLibrary(),
    });
  });

  it('saves and loads', async () => {
    const storage = memoryStorage();
    const library = addItem(emptyLibrary(), item(3));
    await saveLibrary(storage, path, library);
    expect(await loadLibrary(storage, path)).toEqual({ok: true, library});
  });

  it('reports a corrupt file', async () => {
    const outcome = await loadLibrary(memoryStorage({[path]: 'garbage'}), path);
    expect(outcome.ok).toBe(false);
  });
});
