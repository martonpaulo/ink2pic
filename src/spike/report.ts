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

/** Module names worth listing method names for in S0. */
export const INTERESTING_MODULE =
  /file|fs|storage|download|network|http|blob|image|fetch/i;

/** Plain text, one section per spike, so one screenshot carries it. */
export function formatReport(header: string, sections: Section[]): string {
  const parts = [header];
  for (const section of sections) {
    parts.push('', `[${section.title}]`, ...section.lines);
  }
  return parts.join('\n');
}
