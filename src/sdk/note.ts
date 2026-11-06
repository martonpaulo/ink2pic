import {PluginNoteAPI} from 'sn-plugin-lib';
import {attempt, Result} from './result';

/** png, jpg or jpeg only; the host chooses placement and size (brief section 4.4). */
export function insertImage(path: string): Promise<Result<boolean>> {
  return attempt(() => PluginNoteAPI.insertImage(path));
}
