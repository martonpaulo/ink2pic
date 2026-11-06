import {PluginCommAPI, PluginFileAPI} from 'sn-plugin-lib';
import {attempt, Result} from './result';

export type Size = {width: number; height: number};

export function getCurrentFilePath(): Promise<Result<string>> {
  return attempt(() => PluginCommAPI.getCurrentFilePath());
}

export function getCurrentPageNum(): Promise<Result<number>> {
  return attempt(() => PluginCommAPI.getCurrentPageNum());
}

/** Replaces the deprecated `getPageDisplaySize`, as `sn-plugin-lib` 0.2.3 advises. */
export function getPageSize(
  notePath: string,
  page: number,
): Promise<Result<Size>> {
  return attempt(() => PluginFileAPI.getPageSize(notePath, page));
}

/** `Element.TYPE_PICTURE` in sn-plugin-lib 0.2.3 (brief section 4.7). */
export const PICTURE_TYPE = 200;

/** A new element with its native cache, as the official docs require before an insert. */
export function createElement(
  type: number,
): Promise<Result<Record<string, unknown>>> {
  return attempt(() => PluginCommAPI.createElement(type));
}

/** Inserts elements into a page of the current file, in pixel coordinates from getPageSize. */
export function insertPageElements(
  elements: object[],
  page: number,
  layer = 0,
): Promise<Result<boolean>> {
  return attempt(() => PluginCommAPI.insertPageElements(elements, page, layer));
}
