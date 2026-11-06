/**
 * Openclipart through its server-rendered search page; it has no usable public JSON API
 * (brief section 5.1). Every rule about the page's markup lives in this file.
 */
import {fetchText, HttpDeps} from './http';
import {SearchResult, SourceOutcome, sourceFailure} from './types';

const ORIGIN = 'https://openclipart.org';
/** Grid thumbnails sized for the tile (brief section 8.5). */
const THUMB_WIDTH = 400;
/** The width Openclipart serves for an insert: 640 px answers a redirect to it (#48). */
export const OPENCLIPART_FULL_WIDTH = 800;
const LICENSE = 'CC0 1.0';
const ATTRIBUTION = 'Openclipart';

const COUNT = /(\d[\d,]*) clipart for/;
const RESULT = /<a href="\/detail\/(\d+)\/[^"]*">([\s\S]*?)<\/a>/g;
const ALT = /<img [^>]*alt="([^"]*)"/;
const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&#039;': "'",
  '&lt;': '<',
  '&gt;': '>',
};

export function searchUrl(query: string): string {
  return `${ORIGIN}/search/?query=${encodeURIComponent(query.trim())}`;
}

export function imageUrl(id: string, width: number): string {
  return `${ORIGIN}/image/${Math.round(width)}px/${id}`;
}

function decode(text: string): string {
  return text.replace(
    /&(?:amp|quot|lt|gt|#0?39);/g,
    entity => ENTITIES[entity],
  );
}

/** The results of one search page; a page that does not look like one is a parse failure. */
export function parseSearchPage(html: string): SourceOutcome {
  const count = COUNT.exec(html);
  if (!count) {
    return sourceFailure('parse', 'no result count on the page');
  }
  const seen = new Set<string>();
  const results: SearchResult[] = [];
  for (const [, id, inner] of html.matchAll(RESULT)) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    results.push({
      id: `openclipart:${id}`,
      source: 'openclipart',
      title: decode(ALT.exec(inner)?.[1] ?? ''),
      thumbUrl: imageUrl(id, THUMB_WIDTH),
      fullUrl: width => imageUrl(id, width),
      license: LICENSE,
      attribution: ATTRIBUTION,
      mime: 'image/png',
    });
  }
  const total = Number(count[1].replace(/,/g, ''));
  if (total > 0 && results.length === 0) {
    return sourceFailure(
      'parse',
      `the page counts ${total} results but none could be read`,
    );
  }
  return {ok: true, results};
}

export async function searchOpenclipart(
  query: string,
  deps: HttpDeps,
): Promise<SourceOutcome> {
  const page = await fetchText(searchUrl(query), deps);
  return page.ok
    ? parseSearchPage(page.text)
    : sourceFailure(page.kind, page.message);
}
