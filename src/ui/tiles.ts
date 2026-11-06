/**
 * The state of each results-grid tile and the page cut from the tiles that can still show a
 * picture (#64). Pure, so the grid only renders it: a thumbnail is downloaded to its file, shown,
 * retried once from the web when its file cannot be shown (#46), and a tile whose thumbnail fails
 * leaves the list, so the next result takes its place and the page count follows.
 */
import {pageCount, pageOf} from '../search/pages';
import {webRetryUri} from '../search/thumbs';
import type {SearchResult} from '../sources/types';

export type Tile =
  /** The thumbnail is being downloaded to its file; nothing renders yet. */
  | {status: 'download'}
  /** The stored file, the web URL when there is no store, or a library file, loading. */
  | {status: 'show'; uri: string}
  /** The web URL, tried once after the stored file could not be shown. */
  | {status: 'retry'; uri: string}
  /** The picture is on screen. */
  | {status: 'ready'; uri: string}
  /** No picture: the tile leaves the list. */
  | {status: 'failed'};

export type TileEvent =
  | {type: 'downloaded'; uri: string}
  | {type: 'loaded'}
  | {type: 'error'}
  | {type: 'timeout'};

/** A tile's first state, from the URI the grid chose for it; null while it must be downloaded. */
export function initialTile(uri: string | null): Tile {
  return uri === null ? {status: 'download'} : {status: 'show', uri};
}

/** The URI an Image renders for the tile, or null when nothing renders. */
export function tileUri(tile: Tile): string | null {
  return 'uri' in tile ? tile.uri : null;
}

/**
 * The tile after `event`. A shown picture stays shown, so a page never repaints after it showed;
 * an event that does not apply to the state, such as a late download, changes nothing.
 */
export function nextTile(
  tile: Tile,
  event: TileEvent,
  result: SearchResult,
): Tile {
  if (tile.status === 'ready' || tile.status === 'failed') {
    return tile;
  }
  switch (event.type) {
    case 'downloaded':
      return tile.status === 'download'
        ? {status: 'show', uri: event.uri}
        : tile;
    case 'loaded':
      return tile.status === 'download'
        ? tile
        : {status: 'ready', uri: tile.uri};
    case 'error': {
      const retry =
        tile.status === 'show' ? webRetryUri(result, tile.uri) : null;
      return retry === null
        ? {status: 'failed'}
        : {status: 'retry', uri: retry};
    }
    case 'timeout':
      return {status: 'failed'};
  }
}

export type TilePage<T> = {
  /** The results of the open page, without those whose thumbnail failed. */
  visible: T[];
  /** The open page, 0-based, kept on the last page left when failed tiles shorten the list. */
  page: number;
  pages: number;
  /** No result can show a picture. */
  empty: boolean;
};

/** Page `page` of the results whose tiles have not failed: the next result fills a dropped place. */
export function tilePage<T extends {id: string}>(
  results: readonly T[],
  tileOf: (result: T) => Tile,
  page: number,
): TilePage<T> {
  const shown = results.filter(result => tileOf(result).status !== 'failed');
  const pages = pageCount(shown.length);
  const open = Math.max(0, Math.min(page, pages - 1));
  return {
    visible: pageOf(shown, open),
    page: open,
    pages,
    empty: shown.length === 0,
  };
}
