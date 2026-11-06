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

/** Needs an open note context; from a settings screen it fails with 102 (brief section 4.6). */
export function insertElements(
  notePath: string,
  page: number,
  elements: object[],
): Promise<Result<unknown>> {
  return attempt(() => PluginFileAPI.insertElements(notePath, page, elements));
}
