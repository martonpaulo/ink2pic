/**
 * The device's `ImageAnalyzer` (#66): the plugin's own Java module, Ink2PicImage, measures a
 * thumbnail file in plain Java (`ThumbMeasures.java`), off the React Native thread.
 */
import type {ImageAnalyzer, Measures} from '../search/measures';
import {callModule} from './files';

type NativeMeasures = {
  measureThumb: (path: string) => Promise<Measures>;
};

export const deviceAnalyzer: ImageAnalyzer = {
  measure: path =>
    callModule<NativeMeasures, Measures>('Ink2PicImage', image =>
      image.measureThumb(path),
    ),
};
