/** Where Ink2Pic keeps its files (brief section 6.6). */
export const SHARED_FOLDER = 'MyStyle/Ink2Pic';

/**
 * The shared storage root, as the host's own paths show it (`getCurrentFilePath` answered
 * `/storage/emulated/0/Note/...` on the Manta, builds 0.1.0 (3) to (8)). Not read through
 * FileUtils.getExternalDirPath: its module can close the plugin on an error (#13).
 */
export const SHARED_ROOT = '/storage/emulated/0';

/** `<root>/MyStyle/Ink2Pic/<folder>`. */
function sharedDir(externalRoot: string, folder: string): string {
  return `${externalRoot.replace(/\/+$/, '')}/${SHARED_FOLDER}/${folder}`;
}

/** `<root>/MyStyle/Ink2Pic/library`, where inserted pictures and library.json live. */
export function libraryDir(externalRoot = SHARED_ROOT): string {
  return sharedDir(externalRoot, 'library');
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
