/**
 * The device's `ImageAnalyzer` (#66): the plugin's own Java module, Ink2PicImage, measures a
 * thumbnail file (`ThumbMeasures.java`) and writes contour drawings (`Contour.java`) in plain
 * Java, off the React Native thread, on a small pool of its own: the insert's preparation has
 * its own thread and never waits behind thumbnails (#101).
 */
import type {ConvertedImage, ImageAnalyzer, Measures} from '../search-core';
import {callModule} from './files';

type NativeMeasures = {
  measureThumb: (path: string) => Promise<Measures>;
  /**
   * The insert's preparation, PNG, on the thumbnail pool; resolves the measures of the pixels
   * it wrote, so the file is not read again (#101).
   */
  convertThumb: (
    src: string,
    dest: string,
    width: number,
    contour: boolean,
  ) => Promise<ConvertedImage>;
};

const convert = (src: string, dest: string, width: number, contour: boolean) =>
  callModule<NativeMeasures, ConvertedImage>('Ink2PicImage', image =>
    image.convertThumb(src, dest, width, contour),
  );

export const deviceAnalyzer: ImageAnalyzer = {
  measure: path =>
    callModule<NativeMeasures, Measures>('Ink2PicImage', image =>
      image.measureThumb(path),
    ),
  // The insert's own preparation, so the grid shows what goes in.
  toContour: (src, dest, width) => convert(src, dest, width, true),
  // The same preparation without a contour: faint lines darkened (#81).
  darken: (src, dest, width) => convert(src, dest, width, false),
};
