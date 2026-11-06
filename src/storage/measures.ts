/**
 * The device's `ImageAnalyzer` (#66): the plugin's own Java module, Ink2PicImage, measures a
 * thumbnail file (`ThumbMeasures.java`) and writes contour drawings (`Contour.java`) in plain
 * Java, off the React Native thread.
 */
import type {ImageAnalyzer, Measures} from '../search/measures';
import {callModule} from './files';
import {prepareForEink} from './image';

type NativeMeasures = {
  measureThumb: (path: string) => Promise<Measures>;
};

export const deviceAnalyzer: ImageAnalyzer = {
  measure: path =>
    callModule<NativeMeasures, Measures>('Ink2PicImage', image =>
      image.measureThumb(path),
    ),
  // The insert's own preparation, so the grid shows what goes in.
  toContour: (src, dest, width) =>
    prepareForEink(src, dest, width, 'png', true),
};
