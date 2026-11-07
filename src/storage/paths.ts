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

/**
 * `<plugin folder>/insert-download.<extension>`: the raw download of an insert, in the private
 * folder, where replacing it needs no permission; PluginHost counts replacing a file in shared
 * storage as a delete (#62). One fixed name, overwritten by each insert.
 */
export function insertDownloadPath(
  pluginDir: string,
  extension: string,
): string {
  return `${pluginDir}/insert-download.${extension}`;
}

/**
 * `<plugin folder>/insert-early.<extension>`: the full download «Insert picture» starts for the
 * leading picture before page 1's order is known (#88); its own name, so a dropped one never
 * overwrites the winner's download. One fixed name, overwritten by each early download.
 */
export function earlyDownloadPath(
  pluginDir: string,
  extension: string,
): string {
  return `${pluginDir}/insert-early.${extension}`;
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
