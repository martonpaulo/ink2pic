import {PluginNoteAPI} from 'sn-plugin-lib';
import type {Rect} from './lasso';
import {attempt, Result} from './result';

export type TextBoxInput = {text: string; rect: Rect; fontSize: number};

/** Inserts a plain text box into the current page. */
export function insertText({
  text,
  rect,
  fontSize,
}: TextBoxInput): Promise<Result<boolean>> {
  return attempt(() =>
    PluginNoteAPI.insertText({textContentFull: text, textRect: rect, fontSize}),
  );
}

/** png, jpg or jpeg only; the host chooses placement and size (brief section 4.4). */
export function insertImage(path: string): Promise<Result<boolean>> {
  return attempt(() => PluginNoteAPI.insertImage(path));
}

export function saveCurrentNote(): Promise<Result<boolean>> {
  return attempt(() => PluginNoteAPI.saveCurrentNote());
}
