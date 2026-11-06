/**
 * Wikimedia Commons through the MediaWiki Action API (brief section 5.2): a search for drawings,
 * and the files Wikidata names for a word (#43). Fixtures are cut from real responses.
 */
import type {PictureHost, SourceAdapter, SourceContext} from '../adapter';
import {apiFailure} from '../fetcher';
import {PAGE_SIZE, SearchResult, SourceOutcome, sourceFailure} from '../types';

const API = 'https://commons.wikimedia.org/w/api.php';
const INFO_PARAMS = [
  'prop=imageinfo',
  'iiprop=url|mime|size|extmetadata',
  'iiextmetadatafilter=LicenseShortName|Artist|Credit',
];

/** Thumbnail widths Wikimedia serves without strict rate limits (brief section 5.2). */
export const COMMONS_WIDTHS = [
  20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840,
] as const;
/** Grid thumbnails (brief section 8.5). */
const THUMB_WIDTH = 330;
/** Enough for two or three result pages, small enough to stay polite (brief section 5.2). */
const MIN_LIMIT = 12;
const MAX_LIMIT = 18;
/**
 * CirrusSearch keyword for SVG and other drawings [CONFIRMED 2026-11-06, live]: it keeps photos,
 * audio, video and PDF scans out of the results (#43).
 */
export const DRAWING_FILTER = 'filetype:drawing';
/** Pictures only: audio, video and scanned documents have thumbnails but are not pictures. */
const PICTURE_MIME = /^image\/(?!vnd\.djvu)/;
const FALLBACK_ATTRIBUTION = 'Wikimedia Commons';

type Meta = Record<string, {value?: string} | undefined>;
type ImageInfo = {
  thumburl?: string;
  mime?: string;
  url?: string;
  width?: number;
  extmetadata?: Meta;
};
type Page = {
  pageid: number;
  title: string;
  index?: number;
  imageinfo?: ImageInfo[];
};
type Response = {
  batchcomplete?: boolean;
  error?: {code?: string; info?: string};
  query?: {pages?: Page[]; searchinfo?: {suggestion?: string}};
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
  {limit = MAX_LIMIT, thumbWidth = THUMB_WIDTH, drawings = false} = {},
): string {
  const search = drawings ? `${query.trim()} ${DRAWING_FILTER}` : query.trim();
  const params = [
    'action=query',
    'format=json',
    'formatversion=2',
    // The generator sends no `searchinfo`; a one-hit list search beside it carries the spelling
    // suggestion in the same request (research C, 2026-11-06).
    'list=search',
    `srsearch=${encodeURIComponent(search)}`,
    'srnamespace=6',
    'srlimit=1',
    'srinfo=suggestion',
    'srprop=',
    'generator=search',
    'gsrnamespace=6',
    `gsrsearch=${encodeURIComponent(search)}`,
    `gsrlimit=${Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, limit))}`,
    ...INFO_PARAMS,
    `iiurlwidth=${nearestWidth(thumbWidth)}`,
  ];
  return `${API}?${params.join('&')}`;
}

/** The named files (without `File:`), with the same fields a search returns. */
export function filesUrl(
  names: readonly string[],
  {thumbWidth = THUMB_WIDTH} = {},
): string {
  const titles = names.map(name => `File:${name}`).join('|');
  const params = [
    'action=query',
    'format=json',
    'formatversion=2',
    `titles=${encodeURIComponent(titles)}`,
    ...INFO_PARAMS,
    `iiurlwidth=${nearestWidth(thumbWidth)}`,
  ];
  return `${API}?${params.join('&')}`;
}

/** Thumb names are `<n>px-<name>`, or `page<k>-<n>px-` and `lossy-page<k>-<n>px-` for paged files. */
const THUMB_WIDTH_PART = /\/((?:lossy-)?page\d+-)?\d+px-/;

export function resizeThumb(thumb: string, width: number): string {
  return thumb.replace(
    THUMB_WIDTH_PART,
    (_match, page: string | undefined) =>
      `/${page ?? ''}${nearestWidth(width)}px-`,
  );
}

/** The widest picture an insert asks for (brief section 7); 960 is a predefined width. */
export const COMMONS_FULL_WIDTH = 960;
/** Originals insertImage and the e-ink preparation read as they are (brief section 4.4). */
const ORIGINAL_MIMES = new Set(['image/png', 'image/jpeg']);

/**
 * The picture at `width`, never wider than the original: a PNG or JPEG original no wider than the
 * predefined width is taken as it is, since an upscaled thumbnail is larger and may be refused
 * (#48). Any other original keeps its rendered thumbnail.
 */
export function fullImageUrl(
  thumb: string,
  width: number,
  original: {url?: string; width?: number; mime?: string} = {},
): string {
  return original.url &&
    original.width !== undefined &&
    original.width <= nearestWidth(width) &&
    ORIGINAL_MIMES.has(original.mime ?? '')
    ? original.url
    : resizeThumb(thumb, width);
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
  if (!info || !thumb || (info.mime && !PICTURE_MIME.test(info.mime))) {
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
    ...(info.url &&
      info.width !== undefined && {
        original: {url: info.url, width: info.width},
      }),
    license: plainText(meta.LicenseShortName?.value ?? '') || 'unknown',
    attribution,
    mime: info.mime,
  };
}

const bySearchRank = (pages: Page[]) =>
  [...pages].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

/** Commons' «did you mean», without the filter keyword it echoes; none when it is the query. */
function suggestionFor(data: Response, query: string): string | undefined {
  const suggested = data.query?.searchinfo?.suggestion
    ?.replace(DRAWING_FILTER, '')
    .replace(/\s+/g, ' ')
    .trim();
  return suggested &&
    suggested.toLocaleLowerCase() !== query.trim().toLocaleLowerCase()
    ? suggested
    : undefined;
}

/** Results in search rank order, with Commons' spelling suggestion, or why there are none. */
export function parseSearchResponse(text: string, query = ''): SourceOutcome {
  return parseQuery(text, bySearchRank, data => suggestionFor(data, query));
}

/** The named files in the order given; a missing file is left out. */
export function parseFilesResponse(
  text: string,
  names: readonly string[],
): SourceOutcome {
  const rank = (page: Page) => {
    const at = names.indexOf(page.title.replace(/^File:/, ''));
    return at < 0 ? names.length : at;
  };
  return parseQuery(text, pages =>
    [...pages].sort((a, b) => rank(a) - rank(b)),
  );
}

function parseQuery(
  text: string,
  order: (pages: Page[]) => Page[],
  suggest: (data: Response) => string | undefined = () => undefined,
): SourceOutcome {
  let data: Response;
  try {
    data = JSON.parse(text) as Response;
  } catch {
    return sourceFailure('parse', 'the response is not JSON');
  }
  if (data === null || typeof data !== 'object') {
    return sourceFailure('parse', 'the response is not a JSON object');
  }
  if (data.error) {
    return apiFailure(data.error);
  }
  if (!data.query) {
    return data.batchcomplete
      ? {ok: true, results: []}
      : sourceFailure('parse', 'neither query nor error in the response');
  }
  const suggestion = suggest(data);
  return {
    ok: true,
    results: order(data.query.pages ?? [])
      .map(toResult)
      .filter((r): r is SearchResult => r !== null),
    ...(suggestion && {suggestion}),
  };
}

async function ask(
  url: string,
  ctx: SourceContext,
  parse: (text: string) => SourceOutcome,
): Promise<SourceOutcome> {
  const response = await ctx.fetch(url, {'Api-User-Agent': ctx.userAgent});
  return response.ok
    ? parse(response.text)
    : sourceFailure(response.kind, response.message);
}

/**
 * Drawings first (#43). Only when they fill less than one results page does a plain search add
 * what Commons has, so a word with no drawing still shows pictures.
 */
export async function searchCommons(
  query: string,
  ctx: SourceContext,
): Promise<SourceOutcome> {
  const parse = (text: string) => parseSearchResponse(text, query);
  const drawings = await ask(searchUrl(query, {drawings: true}), ctx, parse);
  if (!drawings.ok || drawings.results.length >= PAGE_SIZE) {
    return drawings;
  }
  const plain = await ask(searchUrl(query), ctx, parse);
  if (!plain.ok) {
    return drawings;
  }
  const seen = new Set(drawings.results.map(result => result.id));
  const suggestion = drawings.suggestion ?? plain.suggestion;
  return {
    ok: true,
    results: [
      ...drawings.results,
      ...plain.results.filter(result => !seen.has(result.id)),
    ],
    ...(suggestion && {suggestion}),
  };
}

/** The named Commons files as results, in the order given; no request for an empty list. */
export async function commonsFiles(
  names: readonly string[],
  ctx: SourceContext,
): Promise<SourceOutcome> {
  if (names.length === 0) {
    return {ok: true, results: []};
  }
  return ask(filesUrl(names), ctx, text => parseFilesResponse(text, names));
}

function pictureUrl(result: SearchResult, width: number): string {
  return fullImageUrl(result.thumbUrl, width, {
    ...result.original,
    mime: result.mime,
  });
}

export const commonsPictures: PictureHost = {
  url: pictureUrl,
  insertWidth: COMMONS_FULL_WIDTH,
  // The original only when an insert takes it as it is (#55), with the insert width as its
  // width, an upper bound; otherwise the thumbnail is rebuilt from `thumbUrl`.
  storedOriginal: result => {
    const url = pictureUrl(result, COMMONS_FULL_WIDTH);
    return url === resizeThumb(result.thumbUrl, COMMONS_FULL_WIDTH)
      ? undefined
      : {url, width: COMMONS_FULL_WIDTH};
  },
};

/** Drawings, then a plain search when they fill less than a page. */
export const commonsAdapter: SourceAdapter = {
  name: 'commons',
  search: searchCommons,
  requests: 2,
};
