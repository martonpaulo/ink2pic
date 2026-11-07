import {emptyLibrary, ParsedLibrary, parseLibrary, serialize} from './library';
import type {TextStore} from '../search-core';
import type {Library} from './types';

/** A missing file is an empty library; a corrupt one is a failure the caller shows. */
export async function loadLibrary(
  storage: TextStore,
  path: string,
): Promise<ParsedLibrary> {
  const text = await storage.readText(path);
  return text === null
    ? {ok: true, library: emptyLibrary()}
    : parseLibrary(text);
}

export function saveLibrary(
  storage: TextStore,
  path: string,
  library: Library,
): Promise<void> {
  return storage.writeText(path, serialize(library));
}
