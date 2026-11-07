/**
 * Prepares a saved picture for the 16-gray e-ink screen through the plugin's own Java module,
 * Ink2PicImage (brief sections 7 and 9.4, #17).
 */
import {Result} from '../sdk/result';
import {callModule} from './files';

/** PNG for line art; JPG may be smaller for engravings and photos (brief section 7, TO TEST). */
export type EinkFormat = 'png' | 'jpg';

/** The written file: its size in pixels and in bytes, and the preparation time. */
export type PreparedImage = {
  width: number;
  height: number;
  bytes: number;
  ms: number;
};

/** The module's own rejection codes, besides BAD_PATH, TOO_LARGE, IO and MISSING. */
export type ImageErrorCode =
  | 'BAD_WIDTH'
  | 'BAD_FORMAT'
  | 'NOT_FOUND'
  | 'NOT_IMAGE'
  | 'ENCODE'
  | string;

type NativeImage = {
  prepareForEink: (
    srcPath: string,
    destPath: string,
    targetWidth: number,
    format: EinkFormat,
    contour: boolean,
  ) => Promise<PreparedImage>;
};

/**
 * Writes `dest` from `src`: flattened on white, scaled down to `width` (never up), with
 * `contour` turned into a contour drawing (#66), else faint light-grey lines darkened (#81), gray
 * with the e-ink contrast curve, and for PNG quantized to 16 levels.
 */
export function prepareForEink(
  src: string,
  dest: string,
  width: number,
  format: EinkFormat = 'png',
  contour = false,
): Promise<Result<PreparedImage>> {
  return callModule<NativeImage, PreparedImage>('Ink2PicImage', image =>
    image.prepareForEink(src, dest, width, format, contour),
  );
}
