/**
 * Wikimedia Commons through the MediaWiki Action API (brief section 5.2). Built from the
 * documented response shape; the cloud IP is throttled, so the device run captures a real one.
 */
import {fetchText, HttpDeps} from './http';
import {SearchResult, SourceOutcome, sourceFailure} from './types';
import {USER_AGENT} from '../config';

const API = 'https://commons.wikimedia.org/w/api.php';

/** Thumbnail widths Wikimedia serves without strict rate limits (brief section 5.2). */
export const COMMONS_WIDTHS = [
  20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840,
] as const;
/** Grid thumbnails (brief section 8.5). */
const THUMB_WIDTH = 330;
/** Enough for two or three result pages, small enough to stay polite (brief section 5.2). */
const MIN_LIMIT = 12;
const MAX_LIMIT = 18;
const THROTTLE_CODES = new Set(['ratelimited', 'maxlag']);
const FALLBACK_ATTRIBUTION = 'Wikimedia Commons';

type Meta = Record<string, {value?: string} | undefined>;
type ImageInfo = {thumburl?: string; mime?: string; extmetadata?: Meta};
type Page = {
  pageid: number;
  title: string;
  index?: number;
  imageinfo?: ImageInfo[];
};
type Response = {
  batchcomplete?: boolean;
  error?: {code?: string; info?: string};
  query?: {pages?: Page[]};
};

/** The smallest predefined width at or above `width`, else the largest. */
export function nearestWidth(width: number): number {
  return (
    COMMONS_WIDTHS.find(w => w >= width) ??
    COMMONS_WIDTHS[COMMONS_WIDTHS.length - 1]
  );
}

export function searchUrl(
  query: string,
  {limit = MAX_LIMIT, thumbWidth = THUMB_WIDTH} = {},
): string {
  const params = [
    'action=query',
    'format=json',
    'formatversion=2',
    'generator=search',
    'gsrnamespace=6',
    `gsrsearch=${encodeURIComponent(query.trim())}`,
    `gsrlimit=${Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, limit))}`,
    'prop=imageinfo',
    'iiprop=url|mime|size|extmetadata',
    'iiextmetadatafilter=LicenseShortName|Artist|Credit',
    `iiurlwidth=${nearestWidth(thumbWidth)}`,
  ];
  return `${API}?${params.join('&')}`;
}

function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toResult(page: Page): SearchResult | null {
  const info = page.imageinfo?.[0];
  const thumb = info?.thumburl;
  if (!info || !thumb) {
    return null;
  }
  const meta = info.extmetadata ?? {};
  const attribution =
    plainText(meta.Artist?.value ?? '') ||
    plainText(meta.Credit?.value ?? '') ||
    FALLBACK_ATTRIBUTION;
  return {
    id: `commons:${page.pageid}`,
    source: 'commons',
    title: page.title.replace(/^File:/, '').replace(/\.[^.]+$/, ''),
    thumbUrl: thumb,
    fullUrl: width => thumb.replace(/\/\d+px-/, `/${nearestWidth(width)}px-`),
    license: plainText(meta.LicenseShortName?.value ?? '') || 'unknown',
    attribution,
    mime: info.mime,
  };
}

/** Results in search rank order, or why there are none. */
export function parseSearchResponse(text: string): SourceOutcome {
  let data: Response;
  try {
    data = JSON.parse(text) as Response;
  } catch {
    return sourceFailure('parse', 'the response is not JSON');
  }
  if (data.error) {
    const kind = THROTTLE_CODES.has(data.error.code ?? '')
      ? 'throttled'
      : 'http';
    return sourceFailure(kind, `${data.error.code}: ${data.error.info}`);
  }
  if (!data.query) {
    return data.batchcomplete
      ? {ok: true, results: []}
      : sourceFailure('parse', 'neither query nor error in the response');
  }
  const pages = [...(data.query.pages ?? [])].sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0),
  );
  return {
    ok: true,
    results: pages.map(toResult).filter((r): r is SearchResult => r !== null),
  };
}

export async function searchCommons(
  query: string,
  deps: HttpDeps,
): Promise<SourceOutcome> {
  const response = await fetchText(searchUrl(query), deps, {
    'Api-User-Agent': USER_AGENT,
  });
  return response.ok
    ? parseSearchResponse(response.text)
    : sourceFailure(response.kind, response.message);
}
