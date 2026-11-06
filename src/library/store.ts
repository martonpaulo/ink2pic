import {emptyLibrary, ParsedLibrary, parseLibrary, serialize} from './library';
import type {TextStorage} from '../storage/text';
import type {Library} from './types';

/** A missing file is an empty library; a corrupt one is a failure the caller shows. */
export async function loadLibrary(
  storage: TextStorage,
  path: string,
): Promise<ParsedLibrary> {
  const text = await storage.readText(path);
  return text === null
    ? {ok: true, library: emptyLibrary()}
    : parseLibrary(text);
}

export function saveLibrary(
  storage: TextStorage,
  path: string,
  library: Library,
): Promise<void> {
  return storage.writeText(path, serialize(library));
}
