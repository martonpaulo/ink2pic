/**
 * The word's canonical pictures (#43, brief section 5.4): the Wikidata item that the English
 * Wikipedia article of that title is about, and its flag (P41), logo or symbol (P154) and image
 * (P18), read from Commons. Keyless, two requests per search, none per result.
 *
 * Built from the documented wbgetentities response shape: www.wikidata.org is refused from the
 * cloud session, so the device run is the first live one [TO TEST].
 */
import {commonsFiles} from './commons';
import {apiFailure, fetchText, HttpDeps} from './http';
import {SourceFailure, SourceOutcome, sourceFailure} from './types';
import {USER_AGENT} from '../config';

const API = 'https://www.wikidata.org/w/api.php';
/** Flag first, then logo or symbol, then image: the order they are shown in. */
export const PICTURE_PROPERTIES = ['P41', 'P154', 'P18'] as const;

type Statement = {
  rank?: string;
  mainsnak?: {snaktype?: string; datavalue?: {value?: unknown}};
};
type Entity = {missing?: string; claims?: Record<string, Statement[]>};
type Response = {
  error?: {code?: string; info?: string};
  entities?: Record<string, Entity>;
};

/**
 * The item by its English Wikipedia title: one request that also resolves case and redirects
 * ("apples" is the article "Apple"). The word is lowercased first: recognition answers capitals
 * ("SOUP"), and MediaWiki raises only the first letter, so «SOUP» would miss «Soup» or find an
 * acronym's item (#43).
 * shortcut: English titles only, and a word that is a disambiguation page has no pictures;
 * upgrade to wbsearchentities plus wbgetentities if a device test misses a word this way.
 */
export function entityUrl(query: string): string {
  const params = [
    'action=wbgetentities',
    'format=json',
    'sites=enwiki',
    `titles=${encodeURIComponent(query.trim().toLowerCase())}`,
    'normalize=1',
    'props=claims',
  ];
  return `${API}?${params.join('&')}`;
}

/** The preferred statement's file, else the first normal one; deprecated ones never. */
function fileOf(statements: Statement[] = []): string | undefined {
  const usable = statements.filter(
    s =>
      s.rank !== 'deprecated' &&
      s.mainsnak?.snaktype === 'value' &&
      typeof s.mainsnak.datavalue?.value === 'string',
  );
  const chosen = usable.find(s => s.rank === 'preferred') ?? usable[0];
  return chosen?.mainsnak?.datavalue?.value as string | undefined;
}

export type FilesOutcome = {ok: true; files: string[]} | SourceFailure;

/** The Commons file names of the item's pictures; a word with no item has none. */
export function parseEntityResponse(text: string): FilesOutcome {
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
  if (!data.entities) {
    return sourceFailure('parse', 'no entities in the response');
  }
  const files: string[] = [];
  for (const entity of Object.values(data.entities)) {
    if (entity.missing !== undefined) {
      continue;
    }
    for (const property of PICTURE_PROPERTIES) {
      const file = fileOf(entity.claims?.[property]);
      if (file && !files.includes(file)) {
        files.push(file);
      }
    }
  }
  return {ok: true, files};
}

export async function searchWikidata(
  query: string,
  deps: HttpDeps,
): Promise<SourceOutcome> {
  const response = await fetchText(entityUrl(query), deps, {
    'Api-User-Agent': USER_AGENT,
  });
  if (!response.ok) {
    return sourceFailure(response.kind, response.message);
  }
  const entity = parseEntityResponse(response.text);
  if (!entity.ok) {
    return entity;
  }
  const pictures = await commonsFiles(entity.files, deps);
  return pictures.ok
    ? {
        ok: true,
        results: pictures.results.map(result => ({
          ...result,
          canonical: true,
        })),
      }
    : pictures;
}
