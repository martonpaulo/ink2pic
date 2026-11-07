/**
 * The settings on the device (#68): `MyStyle/Ink2Pic/settings.json`, read once per runtime and
 * written after each change, in place through the plugin's own module (#62). Every problem with
 * the file is logged and the defaults are used; a failed write keeps the change for the session.
 */
import {log, logged} from '../log/memory';
import {systemLanguage} from '../sdk/buttons';
import {fail, ok, THROWN_CODE} from '../sdk/result';
import {parseSettings, serializeSettings, Settings} from '../settings/settings';
import {settingsPath} from './paths';
import type {TextStore} from '../search-core';
import {deviceStorage} from './text';

/** Reads the file; a missing one gives the defaults, a failed read is logged and gives them too. */
export async function loadSettings(
  storage: TextStore,
  path: string,
  system: string | null,
): Promise<Settings> {
  let text: string | null = null;
  try {
    text = await storage.readText(path);
  } catch (error) {
    log(`settings: cannot read ${path}: ${String(error)}; the default is used`);
  }
  const parsed = parseSettings(text, system);
  parsed.problems.forEach(problem => log(problem));
  return parsed.settings;
}

let current: Settings | null = null;

/** The settings, read once per runtime. */
export async function getSettings(): Promise<Settings> {
  if (!current) {
    current = await loadSettings(
      deviceStorage,
      settingsPath(),
      systemLanguage(),
    );
    log(`settings: languages ${current.languages.join(', ')}`);
  }
  return current;
}

/** Keeps `next` for the session and writes it; a failed write is logged. */
export async function saveSettings(next: Settings): Promise<void> {
  current = next;
  await logged('saveSettings', () =>
    deviceStorage.writeText(settingsPath(), serializeSettings(next)).then(
      () => ok(true),
      error => fail(THROWN_CODE, String(error)),
    ),
  );
}

export function resetSettingsForTests(): void {
  current = null;
}
