/** Where Ink2Pic keeps its files (brief section 6.6). */
export const SHARED_FOLDER = 'MyStyle/Ink2Pic';

/** `<root>/MyStyle/Ink2Pic/library`, from the first shared-storage root. */
/** `<root>/MyStyle/Ink2Pic/<folder>`. */
function sharedDir(externalRoot: string, folder: string): string {
  return `${externalRoot.replace(/\/+$/, '')}/${SHARED_FOLDER}/${folder}`;
}

export function libraryDir(externalRoot: string): string {
  return sharedDir(externalRoot, 'library');
}

/** A file name safe on the device: letters, digits, dot, dash and underscore only. */
export function safeFileName(name: string): string {
  return (
    name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'file'
  );
}

/** `<root>/MyStyle/Ink2Pic/logs`, where the session log lives (#21). */
export function logsDir(externalRoot: string): string {
  return sharedDir(externalRoot, 'logs');
}
