/** Text files on the device, for every store that keeps one (library.json, the search cache). */
import type {TextStore} from '../search-core';
import {readText, writeText} from './files';

/** Text files through the Ink2PicFiles module; a failed call throws its message. */
export const deviceStorage: TextStore = {
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
