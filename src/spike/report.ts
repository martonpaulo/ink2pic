/**
 * Pure helpers for the spike report of issue #3 (S0, S1, S3). No SDK, no network.
 */

export type Section = {title: string; lines: string[]};

/** Distinct Openclipart result ids in a search page (`href="/detail/<id>/<slug>"`). */
export function countDetailLinks(html: string): number {
  const ids = new Set<string>();
  for (const match of html.matchAll(/href="\/detail\/(\d+)\//g)) {
    ids.add(match[1]);
  }
  return ids.size;
}

/** `thumburl` values in a Commons Action API response, or the reason there are none. */
export function countThumbUrls(
  text: string,
): {count: number} | {error: string} {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return {error: `not JSON: ${text.slice(0, 80)}`};
  }
  const root = data as {
    error?: {code?: string; info?: string};
    query?: {pages?: Record<string, {imageinfo?: {thumburl?: string}[]}>};
  };
  if (root.error) {
    return {error: `API error ${root.error.code}: ${root.error.info}`};
  }
  const pages = root.query?.pages;
  if (!pages) {
    return {error: 'no query.pages in the response'};
  }
  let count = 0;
  for (const page of Object.values(pages)) {
    count += (page.imageinfo ?? []).filter(info =>
      Boolean(info.thumburl),
    ).length;
  }
  return {count};
}

/**
 * Native modules that could write files or download (brief section 6): file-system libraries
 * other plugins bundle, React Native's own blob and network modules, and the SDK's own modules.
 */
export const CANDIDATE_MODULES = [
  'RNFSManager',
  'RNFSFileTypeRegular',
  'RNFetchBlob',
  'ReactNativeBlobUtil',
  'RNCFileSystem',
  'BlobModule',
  'FileReaderModule',
  'Networking',
  'ImageLoader',
  'ImageStoreManager',
  'RTNFileUtils',
  'FileSelector',
  'NativePluginAPI',
  'NativePluginManager',
  'NativeUIUtils',
] as const;

function methodNames(module: unknown): string[] {
  if (module === null || typeof module !== 'object') {
    return [];
  }
  const record = module as Record<string, unknown>;
  const names = new Set<string>();
  for (
    let o: object | null = record;
    o && o !== Object.prototype;
    o = Object.getPrototypeOf(o)
  ) {
    for (const key of Object.getOwnPropertyNames(o)) {
      if (key !== 'constructor' && typeof record[key] === 'function') {
        names.add(key);
      }
    }
  }
  return [...names].sort();
}

/** One report line for a module found as a TurboModule or a legacy module; null when absent. */
export function describeModule(
  name: string,
  turbo: unknown,
  legacy: unknown,
): string | null {
  if (!turbo && !legacy) {
    return null;
  }
  const kind = [turbo ? 'turbo' : '', legacy ? 'legacy' : '']
    .filter(Boolean)
    .join('+');
  const methods = methodNames(turbo ?? legacy);
  return `${name} (${kind}): ${methods.join(', ') || '(no methods listed)'}`;
}

/** Plain text, one section per spike, so one screenshot carries it. */
export function formatReport(header: string, sections: Section[]): string {
  const parts = [header];
  for (const section of sections) {
    parts.push('', `[${section.title}]`, ...section.lines);
  }
  return parts.join('\n');
}
