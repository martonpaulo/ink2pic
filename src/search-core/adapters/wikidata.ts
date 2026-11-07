/**
 * The word's canonical pictures (#43, #71, brief section 5.4). One Wikipedia search finds the
 * article, its Wikidata item and its lead image, with spelling tolerance («Napolean», «Frederico
 * García Lorca»); the item's claims give its flag (P41), logo or symbol (P154) and image (P18),
 * read from Commons with the lead image. For a person (P31 = Q5), Commons pictures that depict
 * the item join them. Keyless; three requests for a word with an item, one without.
 *
 * Response shapes come from the documented APIs and the research probes of 2026-11-06; the
 * device run is the first live one [TO TEST].
 */
import type {SourceAdapter, SourceContext} from '../adapter';
import {apiFailure} from '../fetcher';
import {lookupLanguages, normalise, readIntent, words} from '../query';
import {Failure, SourceOutcome, sourceFailure} from '../types';
import {commonsFiles, commonsSearch} from './commons';

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
/** The API of one language's Wikipedia: `{language}` is its code. */
const WIKIPEDIA_API = 'https://{language}.wikipedia.org/w/api.php';
/** Flag first, then logo or symbol, then image: the order they are shown in. */
export const PICTURE_PROPERTIES = ['P41', 'P154', 'P18'] as const;
const INSTANCE_OF = 'P31';
const FLAG = PICTURE_PROPERTIES[0];
const HUMAN = 'Q5';
const LOGO = 'P154';
/**
 * The item is an organisation or a brand, so its logo is the picture the query asks for (#81):
 * an instance of one of these classes, or an item with a headquarters (P159), which only
 * organisations have. shortcut: a direct P31 match, not the subclass tree, which would cost a
 * request per query; extend the list when the lab finds an organisation it misses.
 */
const ORGANISATION_CLASSES = new Set([
  'Q43229', // organization
  'Q4830453', // business
  'Q783794', // company
  'Q891723', // public company
  'Q6881511', // enterprise
  'Q167037', // corporation
  'Q431289', // brand
  'Q163740', // nonprofit organization
  'Q178706', // institution
  'Q2385804', // educational institution
  'Q18534', // restaurant chain
]);
const HEADQUARTERS = 'P159';
/** The signature file: never a picture of the person (research C). */
const SIGNATURE = 'P109';

type Statement = {
  rank?: string;
  mainsnak?: {snaktype?: string; datavalue?: {value?: unknown}};
};
type Entity = {missing?: string; claims?: Record<string, Statement[]>};
type EntityResponse = {
  error?: {code?: string; info?: string};
  entities?: Record<string, Entity>;
};
type WikiPage = {
  title?: string;
  index?: number;
  pageimage?: string;
  pageprops?: {wikibase_item?: string; disambiguation?: string};
};
type WikiResponse = {
  batchcomplete?: boolean;
  error?: {code?: string; info?: string};
  query?: {searchinfo?: {suggestion?: string}; pages?: WikiPage[]};
};

/**
 * The best Wikipedia article for the query, in one request: the list search gives the «did you
 * mean», the generator the page with its Wikidata id and lead image (research C: 9 of 9 people
 * found, about 300 bytes gzipped).
 */
export function wikipediaUrl(query: string, language: string): string {
  const q = encodeURIComponent(normalise(query));
  const params = [
    'action=query',
    'format=json',
    'formatversion=2',
    'list=search',
    `srsearch=${q}`,
    'srlimit=1',
    'srinfo=suggestion',
    'srprop=',
    'generator=search',
    `gsrsearch=${q}`,
    'gsrlimit=1',
    `prop=${encodeURIComponent('pageprops|pageimages')}`,
    `ppprop=${encodeURIComponent('wikibase_item|disambiguation')}`,
    'piprop=name',
    'redirects=1',
  ];
  return `${WIKIPEDIA_API.replace('{language}', language)}?${params.join('&')}`;
}

/**
 * The item with a logo (P154) that best matches the subject: Wikidata's own search, one request,
 * only for a logo query whose Wikipedia article does not name its subject («apple logo» found the
 * Logo language, #81). The most linked match wins: «apple» is Apple Inc., not Apple Corps, the
 * first by relevance. shortcut: links measure fame, not the subject's sense; upgrade when the
 * lab finds a logo query it resolves to the wrong brand.
 */
export function logoItemUrl(subject: string): string {
  const q = encodeURIComponent(`${subject} haswbstatement:${LOGO}`);
  const params = [
    'action=query',
    'format=json',
    'formatversion=2',
    'list=search',
    `srsearch=${q}`,
    'srlimit=1',
    'srsort=incoming_links_desc',
    'srprop=',
  ];
  return `${WIKIDATA_API}?${params.join('&')}`;
}

type ItemSearchResponse = {
  error?: {code?: string; info?: string};
  query?: {search?: {title?: string}[]};
};

/** The first item of a Wikidata search, as a hit named by the subject. */
export function parseLogoItemResponse(
  text: string,
  subject: string,
): WikiOutcome {
  const data = parseJson<ItemSearchResponse>(text);
  if (isFailure(data)) {
    return data;
  }
  if (data.error) {
    return apiFailure(data.error);
  }
  const item = data.query?.search?.[0]?.title;
  return {
    ok: true,
    hit:
      item && /^Q\d+$/.test(item)
        ? {title: subject, item, disambiguation: false}
        : null,
  };
}

/** The item's claims, by its id. */
export function entityUrl(item: string): string {
  const params = [
    'action=wbgetentities',
    'format=json',
    `ids=${encodeURIComponent(item)}`,
    'props=claims',
  ];
  return `${WIKIDATA_API}?${params.join('&')}`;
}

export type WikiHit = {
  title: string;
  /** The Wikidata id, when the article has one. */
  item?: string;
  /** The article's lead image, a Commons file name. */
  leadImage?: string;
  disambiguation: boolean;
};

export type WikiOutcome =
  | {ok: true; hit: WikiHit | null; suggestion?: string}
  | Failure;

function parseJson<T>(text: string): T | Failure {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return sourceFailure('parse', 'the response is not JSON');
  }
  if (data === null || typeof data !== 'object') {
    return sourceFailure('parse', 'the response is not a JSON object');
  }
  return data as T;
}

function isFailure(value: unknown): value is Failure {
  return (value as {ok?: unknown}).ok === false;
}

export function parseWikipediaResponse(text: string): WikiOutcome {
  const data = parseJson<WikiResponse>(text);
  if (isFailure(data)) {
    return data;
  }
  if (data.error) {
    return apiFailure(data.error);
  }
  if (!data.query && !data.batchcomplete) {
    return sourceFailure('parse', 'neither query nor error in the response');
  }
  const suggestion = data.query?.searchinfo?.suggestion;
  const page = [...(data.query?.pages ?? [])].sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0),
  )[0];
  const hit: WikiHit | null = page?.title
    ? {
        title: page.title,
        item: page.pageprops?.wikibase_item,
        leadImage: page.pageimage,
        disambiguation: page.pageprops?.disambiguation !== undefined,
      }
    : null;
  return {ok: true, hit, ...(suggestion && {suggestion})};
}

/** The preferred statement's value, else the first normal one; deprecated ones never. */
function valueOf(statements: Statement[] = []): unknown {
  const usable = statements.filter(
    s => s.rank !== 'deprecated' && s.mainsnak?.snaktype === 'value',
  );
  const chosen = usable.find(s => s.rank === 'preferred') ?? usable[0];
  return chosen?.mainsnak?.datavalue?.value;
}

function fileOf(statements?: Statement[]): string | undefined {
  const value = valueOf(statements);
  return typeof value === 'string' ? value : undefined;
}

/** Whether one of the item's classes (P31) is in `classes`. */
function isInstance(
  statements: Statement[] = [],
  classes: ReadonlySet<string>,
): boolean {
  return statements.some(s => {
    const value = s.mainsnak?.datavalue?.value as {id?: unknown} | undefined;
    return (
      s.rank !== 'deprecated' &&
      typeof value?.id === 'string' &&
      classes.has(value.id)
    );
  });
}

const HUMANS: ReadonlySet<string> = new Set([HUMAN]);

function isOrganisation(claims: Record<string, Statement[]> = {}): boolean {
  return (
    isInstance(claims[INSTANCE_OF], ORGANISATION_CLASSES) ||
    valueOf(claims[HEADQUARTERS]) !== undefined
  );
}

export type EntityOutcome =
  | {
      ok: true;
      files: string[];
      human: boolean;
      signature?: string;
      /** The item's own flag (P41): it leads the page (#89). */
      flag?: string;
      /** The logo file, when the item is an organisation or a brand: it leads the page (#81). */
      leadingLogo?: string;
    }
  | Failure;

/**
 * The Commons file names of the item's pictures, whether it is a person, its signature and its
 * own flag.
 */
export function parseEntityResponse(text: string): EntityOutcome {
  const data = parseJson<EntityResponse>(text);
  if (isFailure(data)) {
    return data;
  }
  if (data.error) {
    return apiFailure(data.error);
  }
  if (!data.entities) {
    return sourceFailure('parse', 'no entities in the response');
  }
  const files: string[] = [];
  let human = false;
  let signature: string | undefined;
  let flag: string | undefined;
  let leadingLogo: string | undefined;
  for (const entity of Object.values(data.entities)) {
    if (entity.missing !== undefined) {
      continue;
    }
    flag ??= fileOf(entity.claims?.[FLAG]);
    for (const property of PICTURE_PROPERTIES) {
      const file = fileOf(entity.claims?.[property]);
      if (file && !files.includes(file)) {
        files.push(file);
      }
    }
    human ||= isInstance(entity.claims?.[INSTANCE_OF], HUMANS);
    signature ??= fileOf(entity.claims?.[SIGNATURE]);
    if (isOrganisation(entity.claims)) {
      leadingLogo ??= fileOf(entity.claims?.[LOGO]);
    }
  }
  return {
    ok: true,
    files: files.filter(file => file !== signature),
    human,
    ...(signature && {signature}),
    ...(flag && flag !== signature && {flag}),
    ...(leadingLogo && {leadingLogo}),
  };
}

/**
 * Whether the article can be the query's: a query that names a style («apple logo») must find an
 * article naming its subject, or the style word alone finds one («Logo (programming language)»,
 * whose turtle curve then led page 1, #81). Without a style word, the search's spelling tolerance
 * decides («elephent»).
 */
export function isQueryArticle(query: string, title: string): boolean {
  const {subject, styles} = readIntent(query);
  if (styles.size === 0) {
    return true;
  }
  const have = words(title);
  return subject.some(word => have.includes(word));
}

/** For a logo query, the item with a logo its subject names; for any other, none (#81). */
async function logoItem(
  query: string,
  ctx: SourceContext,
): Promise<WikiOutcome> {
  const {subject, styles} = readIntent(query);
  if (!styles.has('logo') || subject.length === 0) {
    return {ok: true, hit: null};
  }
  const named = subject.join(' ');
  const response = await ctx.fetch(logoItemUrl(named), {
    'Api-User-Agent': ctx.userAgent,
  });
  return response.ok ? parseLogoItemResponse(response.text, named) : response;
}

/** The first language whose Wikipedia has an article for the query; a failure stops the walk. */
async function lookup(query: string, ctx: SourceContext): Promise<WikiOutcome> {
  let suggestion: string | undefined;
  for (const language of lookupLanguages(query, ctx.languages)) {
    const response = await ctx.fetch(wikipediaUrl(query, language), {
      'Api-User-Agent': ctx.userAgent,
    });
    if (!response.ok) {
      return response;
    }
    const found = parseWikipediaResponse(response.text);
    if (found.ok && found.hit && !isQueryArticle(query, found.hit.title)) {
      return logoItem(query, ctx);
    }
    if (!found.ok || found.hit) {
      return found;
    }
    suggestion ??= found.suggestion;
  }
  return {ok: true, hit: null, ...(suggestion && {suggestion})};
}

/** A spelling to try when nothing was found: Wikipedia's «did you mean», else its article title. */
function suggestionOf(
  query: string,
  found: {hit: WikiHit | null; suggestion?: string},
) {
  const candidate = found.suggestion ?? found.hit?.title;
  return candidate &&
    candidate.toLocaleLowerCase() !== normalise(query).toLocaleLowerCase()
    ? {suggestion: candidate}
    : {};
}

export async function searchWikidata(
  query: string,
  ctx: SourceContext,
): Promise<SourceOutcome> {
  const found = await lookup(query, ctx);
  if (!found.ok) {
    return found;
  }
  const {hit} = found;
  const suggestion = suggestionOf(query, found);
  if (!hit || hit.disambiguation) {
    return {ok: true, results: [], ...suggestion};
  }
  let files: string[] = [];
  let human = false;
  let signature: string | undefined;
  let flag: string | undefined;
  let leadingLogo: string | undefined;
  if (hit.item) {
    const response = await ctx.fetch(entityUrl(hit.item), {
      'Api-User-Agent': ctx.userAgent,
    });
    if (!response.ok) {
      return response;
    }
    const entity = parseEntityResponse(response.text);
    if (!entity.ok) {
      return entity;
    }
    ({files, human, signature, flag, leadingLogo} = entity);
  }
  if (hit.leadImage) {
    // The lead image uses underscores; Commons file names use spaces.
    const lead = hit.leadImage.replace(/_/g, ' ');
    if (!files.includes(lead) && lead !== signature) {
      files.push(lead);
    }
  }
  const [pictures, gallery] = await Promise.all([
    commonsFiles(files, ctx),
    human && hit.item
      ? commonsSearch(`haswbstatement:P180=${hit.item} filetype:bitmap`, ctx)
      : Promise.resolve<SourceOutcome>({ok: true, results: []}),
  ]);
  if (!pictures.ok) {
    return pictures;
  }
  if (!gallery.ok) {
    ctx.log(`wikidata: depicts gallery of ${hit.item}: ${gallery.message}`);
  }
  const signed = (title: string) =>
    signature !== undefined && title === withoutExtension(signature);
  // A country's own flag leads, before regional and other flags (#89); so does an
  // organisation's or a brand's own logo (#81).
  const leads = (title: string) =>
    (flag !== undefined && title === withoutExtension(flag)) ||
    (leadingLogo !== undefined && title === withoutExtension(leadingLogo));
  return {
    ok: true,
    results: [
      ...pictures.results.map(result => ({
        ...result,
        canonical: true,
        ...(leads(result.title) && {leads: true as const}),
      })),
      ...(gallery.ok ? gallery.results : []).filter(r => !signed(r.title)),
    ],
    ...suggestion,
  };
}

/** A Commons file name without its extension: the result's title. */
function withoutExtension(file: string): string {
  return file.replace(/\.[^.]+$/, '');
}

/**
 * The article and its item, the claims, then the files with the people gallery beside them; it
 * only adds pictures to the other sources.
 */
export const wikidataAdapter: SourceAdapter = {
  name: 'wikidata',
  search: searchWikidata,
  requests: ctx => ctx.languages.length + 2,
  supplement: true,
};
