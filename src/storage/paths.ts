/** Where Ink2Pic keeps its files (brief section 6.6). */
export const SHARED_FOLDER = 'MyStyle/Ink2Pic';

/**
 * The shared storage root, as the host's own paths show it (`getCurrentFilePath` answered
 * `/storage/emulated/0/Note/...` on the Manta, builds 0.1.0 (3) to (8)). Not read through
 * FileUtils.getExternalDirPath: its module can close the plugin on an error (#13).
 */
export const SHARED_ROOT = '/storage/emulated/0';

/** `<root>/MyStyle/Ink2Pic/<name>`, a folder or a file. */
function sharedDir(externalRoot: string, folder: string): string {
  return `${externalRoot.replace(/\/+$/, '')}/${SHARED_FOLDER}/${folder}`;
}

/** `<root>/MyStyle/Ink2Pic/library`, where inserted pictures and library.json live. */
export function libraryDir(externalRoot = SHARED_ROOT): string {
  return sharedDir(externalRoot, 'library');
}

/** The start of every temporary download's name in the private folder (#93). */
export const TEMPORARY_PREFIX = 'insert-';

/**
 * `<plugin folder>/insert-<result id>.<extension>`: the raw download of an insert, in the private
 * folder, where writing it needs no permission; PluginHost counts replacing a file in shared
 * storage as a delete (#62). Named per result, so two inserts at the same time never write one
 * file (#93); removed after the insert.
 */
export function insertDownloadPath(
  pluginDir: string,
  id: string,
  extension: string,
): string {
  return `${pluginDir}/${TEMPORARY_PREFIX}${safeFileName(id)}.${extension}`;
}

/**
 * `<plugin folder>/insert-early-<result id>.<extension>`: the full download «Insert picture»
 * starts for the leading picture before page 1's order is known (#88); its own name, so a dropped
 * one never overwrites the winner's download (#93); removed once used or dropped.
 */
export function earlyDownloadPath(
  pluginDir: string,
  id: string,
  extension: string,
): string {
  return `${pluginDir}/${TEMPORARY_PREFIX}early-${safeFileName(id)}.${extension}`;
}

/** True for a temporary download of `insertDownloadPath` or `earlyDownloadPath` in `pluginDir`. */
export function isTemporaryDownload(pluginDir: string, path: string): boolean {
  return (
    path.startsWith(`${pluginDir}/${TEMPORARY_PREFIX}`) &&
    !path.slice(pluginDir.length + 1).includes('/')
  );
}

/** A file name safe on the device: letters, digits, dot, dash and underscore only. */
export function safeFileName(name: string): string {
  return (
    name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'file'
  );
}

/** `<root>/MyStyle/Ink2Pic/logs`, where the session log lives (#21). */
export function logsDir(externalRoot = SHARED_ROOT): string {
  return sharedDir(externalRoot, 'logs');
}

/**
 * `<root>/MyStyle/Ink2Pic/settings.json`, the person's settings (#68): in shared storage, so a
 * plugin update keeps them, written in place (#62).
 */
export function settingsPath(externalRoot = SHARED_ROOT): string {
  return sharedDir(externalRoot, 'settings.json');
}

/**
 * `<root>/MyStyle/Ink2Pic/symbols`, the OpenMoji pictures kept for offline use (#91), one
 * `<hex>.png` each, written in place (#62).
 */
export function symbolsDir(externalRoot = SHARED_ROOT): string {
  return sharedDir(externalRoot, 'symbols');
}
