/**
 * Which trailing words of a written line name the thing (#87): «Quem foi Miguel de Cervantes»
 * searches «Miguel de Cervantes», «Eu comi uma banana» searches «banana». The question words go
 * first (`stripQuestion`), then every trailing word group is checked as a Wikipedia title in ONE
 * request (`action=query&titles=A|B|C&redirects=1`), longest first; the first group that is an
 * article with a Wikidata item wins, else the last word.
 *
 * The winning article is kept for the Wikidata lookup of the same query (#71), which then makes no
 * request of its own: the line costs the same requests as a one-word search. When no group is an
 * article, the lookup searches the last word as before, one request more. The device run is the
 * first live one [TO TEST].
 */
import type {SourceContext} from './adapter';
import {apiFailure} from './fetcher';
import {lookupLanguages, normalise, stripQuestion, trailingGroups} from './query';
import {Failure, sourceFailure} from './types';
import type {WikiHit} from './adapters/wikidata';

const WIKIPEDIA_API = 'https://{language}.wikipedia.org/w/api.php';

/** The groups as titles, with redirects followed, their item and lead image, in one request. */
export function titlesUrl(groups: readonly string[], language: string): string {
  const params = [
    'action=query',
    'format=json',
    'formatversion=2',
    `titles=${encodeURIComponent(groups.join('|'))}`,
    'redirects=1',
    `prop=${encodeURIComponent('pageprops|pageimages')}`,
    `ppprop=${encodeURIComponent('wikibase_item|disambiguation')}`,
    'piprop=name',
  ];
  return `${WIKIPEDIA_API.replace('{language}', language)}?${params.join('&')}`;
}

type Renamed = {from?: string; to?: string};
type TitlePage = {
  title?: string;
  missing?: boolean;
  invalid?: boolean;
  pageimage?: string;
  pageprops?: {wikibase_item?: string; disambiguation?: string};
};
type TitlesResponse = {
  error?: {code?: string; info?: string};
  query?: {normalized?: Renamed[]; redirects?: Renamed[]; pages?: TitlePage[]};
};

/** The first group, in order, that is an article with an item; null when none is. */
export function parseTitles(
  text: string,
  groups: readonly string[],
): {group: string; hit: WikiHit} | null | Failure {
  let data: TitlesResponse;
  try {
    data = JSON.parse(text) as TitlesResponse;
  } catch {
    return sourceFailure('parse', 'the titles check answered no JSON');
  }
  if (data?.error) {
    return apiFailure(data.error);
  }
  const query = data?.query ?? {};
  const rename = (list: Renamed[] = [], title: string) =>
    list.find(entry => entry.from === title)?.to ?? title;
  for (const group of groups) {
    const title = rename(query.redirects, rename(query.normalized, group));
    const page = (query.pages ?? []).find(p => p.title === title);
    const item = page?.pageprops?.wikibase_item;
    if (page && !page.missing && !page.invalid && item && !page.pageprops?.disambiguation) {
      return {
        group,
        hit: {title, item, leadImage: page.pageimage, disambiguation: false},
      };
    }
  }
  return null;
}

/** The last winner's article, for the lookup of that query in that language. */
let known: {key: string; hit: WikiHit} | null = null;

function keyOf(query: string, language: string): string {
  return `${language}:${normalise(query).toLocaleLowerCase()}`;
}

/** The article a resolved line found for this query, so the lookup asks nothing again. */
export function knownHit(query: string, language: string): WikiHit | null {
  return known?.key === keyOf(query, language) ? known.hit : null;
}

/** Forgets the kept article (tests). */
export function forgetKnownHit(): void {
  known = null;
}

export type PhraseChoice = {
  /** What is searched: the winning group, or the last word. */
  query: string;
  /** How many of the line's last words it covers. */
  words: number;
  /** The groups that were checked, longest first. */
  groups: string[];
};

/**
 * The words of `line` to search, by one Wikipedia request in the first lookup language. A failed
 * request falls back to the last word, with the failure logged: the line is never lost.
 */
export async function resolvePhrase(
  line: string,
  ctx: SourceContext,
): Promise<PhraseChoice | null> {
  const asked = stripQuestion(line, ctx.languages);
  const groups = trailingGroups(asked);
  if (groups.length === 0) {
    return null;
  }
  const last = groups[groups.length - 1];
  const fallback = {query: last, words: 1, groups};
  const [language] = lookupLanguages(asked, ctx.languages);
  if (groups.length === 1 || !language) {
    return fallback;
  }
  const response = await ctx.fetch(titlesUrl(groups, language), {
    'Api-User-Agent': ctx.userAgent,
  });
  if (!response.ok) {
    ctx.log(`phrase "${asked}": ${response.message}; the last word is searched`);
    return fallback;
  }
  const found = parseTitles(response.text, groups);
  if (found === null || 'ok' in found) {
    ctx.log(`phrase "${asked}": no title among ${groups.length} groups`);
    return fallback;
  }
  known = {key: keyOf(found.group, language), hit: found.hit};
  ctx.log(`phrase "${asked}": "${found.group}" is ${found.hit.item}`);
  return {query: found.group, words: found.group.split(' ').length, groups};
}
