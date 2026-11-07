/**
 * Openclipart through its server-rendered search page; it has no usable public JSON API
 * (brief section 5.1). Every rule about the page's markup lives in this file.
 */
import type {PictureHost, SourceAdapter, SourceContext} from '../adapter';
import {SearchResult, SourceOutcome, sourceFailure, sourceId} from '../types';

const ORIGIN = 'https://openclipart.org';
/** Grid thumbnails sized for the tile (brief section 8.5). */
const THUMB_WIDTH = 400;
/**
 * The data saver's thumbnails and results per search (#70): 200 px is the size the search page
 * itself uses, about 12 KB (brief section 5.1).
 */
const SAVER_THUMB_WIDTH = 200;
const SAVER_RESULTS = 12;
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
  ctx: SourceContext,
): Promise<SourceOutcome> {
  const page = await ctx.fetch(searchUrl(query));
  if (!page.ok) {
    return sourceFailure(page.kind, page.message);
  }
  const parsed = parseSearchPage(page.text);
  if (!parsed.ok || !ctx.dataSaver) {
    return parsed;
  }
  // The page is one request either way: fewer, smaller thumbnails are what the saver saves.
  return {
    ...parsed,
    results: parsed.results.slice(0, SAVER_RESULTS).map(result => ({
      ...result,
      thumbUrl: imageUrl(sourceId(result.id), SAVER_THUMB_WIDTH),
    })),
  };
}

export const openclipartPictures: PictureHost = {
  url: (result, width) => imageUrl(sourceId(result.id), width),
  insertWidth: OPENCLIPART_FULL_WIDTH,
};

export const openclipartAdapter: SourceAdapter = {
  name: 'openclipart',
  search: searchOpenclipart,
};
