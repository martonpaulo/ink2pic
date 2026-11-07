/** Text files on the device, for every store that keeps one (library.json, the search cache). */
import type {TextStore} from '../search-core';
import {CallFailure, THROWN_CODE} from '../sdk/result';
import {readText, writeText} from './files';

/** A failed module call thrown as an Error that keeps its `code` and `moduleCode` (#99). */
export class StorageError extends Error {
  constructor(readonly failure: CallFailure) {
    super(failure.message);
    this.name = 'StorageError';
  }
}

/** The CallFailure a TextStore call threw, with its codes when the module gave them. */
export function storageFailure(error: unknown): CallFailure {
  return error instanceof StorageError
    ? error.failure
    : {ok: false, code: THROWN_CODE, message: String(error)};
}

/** Text files through the Ink2PicFiles module; a failed call throws a StorageError. */
export const deviceStorage: TextStore = {
  readText: async path => {
    const text = await readText(path);
    if (!text.ok) {
      throw new StorageError(text);
    }
    return text.value;
  },
  writeText: async (path, text) => {
    const written = await writeText(path, text);
    if (!written.ok) {
      throw new StorageError(written);
    }
  },
};
