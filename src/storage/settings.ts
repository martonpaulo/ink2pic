/**
 * The settings on the device (#68): `MyStyle/Ink2Pic/settings.json`, read once per runtime and
 * written after each change, in place through the plugin's own module (#62). Every problem with
 * the file is logged and the defaults are used; a failed write keeps the change for the session.
 * A failed read is kept as state (#99): the session runs on the defaults and never writes them
 * over the person's file, which the next runtime reads again.
 */
import {log, logged} from '../log/memory';
import {systemLanguage} from '../sdk/buttons';
import {ok} from '../sdk/result';
import {parseSettings, serializeSettings, Settings} from '../settings/settings';
import {settingsPath} from './paths';
import type {TextStore} from '../search-core';
import {deviceStorage, storageFailure} from './text';

/** The settings read, and why the file could not be read, or null. */
export type LoadedSettings = {settings: Settings; readFailure: string | null};

/** Reads the file; a missing one gives the defaults, a failed read gives them and says why. */
export async function loadSettings(
  storage: TextStore,
  path: string,
  system: string | null,
): Promise<LoadedSettings> {
  let text: string | null = null;
  try {
    text = await storage.readText(path);
  } catch (error) {
    // The module's message already starts with its code, such as «IO: …».
    const readFailure = storageFailure(error).message;
    log(`settings: cannot read ${path}: ${readFailure}; the default is used`);
    return {settings: parseSettings(null, system).settings, readFailure};
  }
  const parsed = parseSettings(text, system);
  parsed.problems.forEach(problem => log(problem));
  return {settings: parsed.settings, readFailure: null};
}

let current: Settings | null = null;
/** Why this runtime could not read the file; while set, nothing is written over it. */
let readFailure: string | null = null;

/** The settings, read once per runtime. */
export async function getSettings(): Promise<Settings> {
  if (!current) {
    const loaded = await loadSettings(
      deviceStorage,
      settingsPath(),
      systemLanguage(),
    );
    current = loaded.settings;
    readFailure = loaded.readFailure;
    log(`settings: languages ${current.languages.join(', ')}`);
  }
  return current;
}

/**
 * Keeps `next` for the session and writes it; a failed write is logged. After a failed read the
 * write is refused: `next` started from the defaults, so writing it would replace the person's
 * file (#99).
 */
export async function saveSettings(next: Settings): Promise<void> {
  current = next;
  if (readFailure !== null) {
    log(
      `settings: not saved, the file could not be read (${readFailure}); the change lasts for this session`,
    );
    return;
  }
  await logged('saveSettings', () =>
    deviceStorage
      .writeText(settingsPath(), serializeSettings(next))
      .then(() => ok(true), storageFailure),
  );
}

export function resetSettingsForTests(): void {
  current = null;
  readFailure = null;
}
