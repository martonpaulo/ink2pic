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
import {knownHit} from '../phrase';
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
 * The item is an organisation: it has a headquarters (P159). With its logo, or without one the
 * first file of its Commons «logos» category, the logo leads the page (#81, #92).
 */
const HEADQUARTERS = 'P159';
/**
 * The item is a place: it has coordinates (P625). A logo (P154) leads the page for any item but
 * a person or a place, so a brand with no class list entry and no headquarters, Coca-Cola
 * (P31 drink brand, trademark), still leads with its logo (#92).
 */
const COORDINATES = 'P625';
/** The item's Commons category (P373): its «<category> logos» subcategory holds its logos. */
const COMMONS_CATEGORY = 'P373';
/**
 * A name, not a person: the article of the word is about the given or family name («Napoleão»,
 * a family name in the English Wikipedia), so the most notable person it names is the subject
 * (#92).
 */
const NAMES: ReadonlySet<string> = new Set([
  'Q101352', // family name
  'Q202444', // given name
  'Q12308941', // male given name
  'Q11879590', // female given name
  'Q3409032', // unisex given name
]);
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

/** How many of Wikidata's label matches are checked for a logo. */
const LOGO_CANDIDATES = 5;

/**
 * The items whose label or alias matches the subject, in the order Wikidata's own search box
 * ranks them (#81): «apple» gives the fruit, then Apple Inc. Only for a logo query whose Wikipedia
 * article does not name its subject («apple logo» found the Logo language).
 */
export function logoCandidatesUrl(subject: string, language: string): string {
  const params = [
    'action=wbsearchentities',
    'format=json',
    `search=${encodeURIComponent(subject)}`,
    `language=${encodeURIComponent(language)}`,
    'type=item',
    `limit=${LOGO_CANDIDATES}`,
  ];
  return `${WIKIDATA_API}?${params.join('&')}`;
}

/** The candidates' claims, in one request. */
export function claimsUrl(items: readonly string[]): string {
  return entityUrl(items.join('|'));
}

type CandidatesResponse = {
  error?: {code?: string; info?: string};
  search?: {id?: string}[];
};

/** The candidate item ids, in Wikidata's order. */
export function parseLogoCandidates(text: string): string[] | Failure {
  const data = parseJson<CandidatesResponse>(text);
  if (isFailure(data)) {
    return data;
  }
  if (data.error) {
    return apiFailure(data.error);
  }
  return (data.search ?? [])
    .map(entry => entry.id)
    .filter((id): id is string => typeof id === 'string' && /^Q\d+$/.test(id));
}

/**
 * The first candidate, in Wikidata's order, that is an organisation or a brand with a logo, as a
 * hit named by the subject: «apple» is Apple Inc., never the fruit, which has no logo.
 */
export function parseLogoItem(
  text: string,
  order: readonly string[],
  subject: string,
): WikiOutcome {
  const data = parseJson<EntityResponse>(text);
  if (isFailure(data)) {
    return data;
  }
  if (data.error) {
    return apiFailure(data.error);
  }
  const item = order.find(id => {
    const claims = data.entities?.[id]?.claims;
    return leadingLogoOf(claims) !== undefined;
  });
  return {
    ok: true,
    hit: item ? {title: subject, item, disambiguation: false} : null,
  };
}

/**
 * The most notable person the name names: Wikidata's full-text search matches the labels of
 * every language («Napoleão Bonaparte» in Portuguese), and the item with the most incoming links
 * comes first (#92).
 */
export function notablePersonUrl(name: string): string {
  const params = [
    'action=query',
    'format=json',
    'formatversion=2',
    'list=search',
    `srsearch=${encodeURIComponent(
      `${normalise(name)} haswbstatement:P31=${HUMAN}`,
    )}`,
    'srlimit=1',
    'srprop=',
    'srsort=incoming_links_desc',
  ];
  return `${WIKIDATA_API}?${params.join('&')}`;
}

type PersonResponse = {
  error?: {code?: string; info?: string};
  query?: {search?: {title?: string}[]};
};

/** The person's item id, or null when the search found nobody. */
export function parseNotablePerson(text: string): string | null | Failure {
  const data = parseJson<PersonResponse>(text);
  if (isFailure(data)) {
    return data;
  }
  if (data.error) {
    return apiFailure(data.error);
  }
  const id = data.query?.search?.[0]?.title;
  return typeof id === 'string' && /^Q\d+$/.test(id) ? id : null;
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
  return valueOf(claims[HEADQUARTERS]) !== undefined;
}

/** The logo that leads the page: an organisation's, or any item's but a person's or a place's. */
function leadingLogoOf(
  claims: Record<string, Statement[]> = {},
): string | undefined {
  const logo = fileOf(claims[LOGO]);
  const leads =
    isOrganisation(claims) ||
    (!isInstance(claims[INSTANCE_OF], HUMANS) &&
      valueOf(claims[COORDINATES]) === undefined);
  return leads ? logo : undefined;
}

export type EntityOutcome =
  | {
      ok: true;
      files: string[];
      human: boolean;
      /** The item is a given or family name, not the person (#92). */
      name?: true;
      signature?: string;
      /** The item's own flag (P41): it leads the page (#89). */
      flag?: string;
      /** The logo file, when the item is an organisation or a brand: it leads the page (#81). */
      leadingLogo?: string;
      /** An organisation with no logo: the Commons category whose «logos» child holds it (#92). */
      logoCategory?: string;
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
  let name = false;
  let signature: string | undefined;
  let flag: string | undefined;
  let leadingLogo: string | undefined;
  let logoCategory: string | undefined;
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
    name ||= isInstance(entity.claims?.[INSTANCE_OF], NAMES);
    signature ??= fileOf(entity.claims?.[SIGNATURE]);
    leadingLogo ??= leadingLogoOf(entity.claims);
    if (isOrganisation(entity.claims) && !fileOf(entity.claims?.[LOGO])) {
      logoCategory ??= fileOf(entity.claims?.[COMMONS_CATEGORY]);
    }
  }
  return {
    ok: true,
    files: files.filter(file => file !== signature),
    human,
    ...(name && {name: true as const}),
    ...(signature && {signature}),
    ...(flag && flag !== signature && {flag}),
    ...(leadingLogo && {leadingLogo}),
    ...(!leadingLogo && logoCategory && {logoCategory}),
  };
}

/** The Commons search for the files of an organisation's «logos» category (#92). */
export function logoCategorySearch(category: string): string {
  return `incategory:"${category.replace(/ /g, '_')}_logos"`;
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

/**
 * For a logo query, the organisation or brand its subject names, with its logo; for any other,
 * none (#81). Two requests, only when the Wikipedia article did not name the subject.
 */
async function logoItem(
  query: string,
  language: string,
  ctx: SourceContext,
): Promise<WikiOutcome> {
  const {subject, styles} = readIntent(query);
  if (!styles.has('logo') || subject.length === 0) {
    return {ok: true, hit: null};
  }
  const named = subject.join(' ');
  const headers = {'Api-User-Agent': ctx.userAgent};
  const found = await ctx.fetch(logoCandidatesUrl(named, language), headers);
  if (!found.ok) {
    return found;
  }
  const order = parseLogoCandidates(found.text);
  if (isFailure(order) || order.length === 0) {
    return isFailure(order) ? order : {ok: true, hit: null};
  }
  const claims = await ctx.fetch(claimsUrl(order), headers);
  return claims.ok ? parseLogoItem(claims.text, order, named) : claims;
}

/** The first language whose Wikipedia has an article for the query; a failure stops the walk. */
async function lookup(query: string, ctx: SourceContext): Promise<WikiOutcome> {
  let suggestion: string | undefined;
  for (const language of lookupLanguages(query, ctx.languages)) {
    // A written line's check already found this article (#87): no request again.
    const known = knownHit(query, language);
    if (known) {
      return {ok: true, hit: known};
    }
    const response = await ctx.fetch(wikipediaUrl(query, language), {
      'Api-User-Agent': ctx.userAgent,
    });
    if (!response.ok) {
      return response;
    }
    const found = parseWikipediaResponse(response.text);
    if (found.ok && found.hit && !isQueryArticle(query, found.hit.title)) {
      return logoItem(query, language, ctx);
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

/** The item's pictures and kind, in one request. */
async function entityOf(
  item: string,
  ctx: SourceContext,
): Promise<EntityOutcome> {
  const response = await ctx.fetch(entityUrl(item), {
    'Api-User-Agent': ctx.userAgent,
  });
  return response.ok ? parseEntityResponse(response.text) : response;
}

/** The most notable person a name names, when there is one. */
async function notablePerson(
  name: string,
  ctx: SourceContext,
): Promise<{ok: true; item?: string} | Failure> {
  const response = await ctx.fetch(notablePersonUrl(name), {
    'Api-User-Agent': ctx.userAgent,
  });
  if (!response.ok) {
    return response;
  }
  const found = parseNotablePerson(response.text);
  return isFailure(found) ? found : {ok: true, ...(found && {item: found})};
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
  let logoCategory: string | undefined;
  let item = hit.item;
  let leadImage = hit.leadImage;
  if (item) {
    let entity = await entityOf(item, ctx);
    if (entity.ok && entity.name) {
      // The article is the name's: the most notable person it names is the subject (#92).
      const person = await notablePerson(query, ctx);
      if (!person.ok) {
        return person;
      }
      if (person.item) {
        item = person.item;
        leadImage = undefined;
        entity = await entityOf(item, ctx);
      }
    }
    if (!entity.ok) {
      return entity;
    }
    ({files, human, signature, flag, leadingLogo, logoCategory} = entity);
  }
  if (leadImage) {
    // The lead image uses underscores; Commons file names use spaces.
    const lead = leadImage.replace(/_/g, ' ');
    if (!files.includes(lead) && lead !== signature) {
      files.push(lead);
    }
  }
  const none = Promise.resolve<SourceOutcome>({ok: true, results: []});
  const [pictures, gallery, logos] = await Promise.all([
    commonsFiles(files, ctx),
    human && item
      ? commonsSearch(`haswbstatement:P180=${item} filetype:bitmap`, ctx)
      : none,
    logoCategory ? commonsSearch(logoCategorySearch(logoCategory), ctx) : none,
  ]);
  if (!pictures.ok) {
    return pictures;
  }
  if (!gallery.ok) {
    ctx.log(`wikidata: depicts gallery of ${item}: ${gallery.message}`);
  }
  if (!logos.ok) {
    ctx.log(`wikidata: logos of ${item}: ${logos.message}`);
  }
  // An organisation with no logo on its item leads with its Commons category's first logo (#92).
  const categoryLogo = logos.ok ? logos.results[0] : undefined;
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
      ...(categoryLogo
        ? [{...categoryLogo, canonical: true, leads: true as const}]
        : []),
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
