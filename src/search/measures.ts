/**
 * Pixel measures of a thumbnail and what they say about it (#66; research note
 * 2026-11-search-ranking sections 3, 4 and 7, and research D on iconic pictures). Portable core:
 * no React Native, no SDK; the measuring itself sits behind `ImageAnalyzer`, which the device
 * implements in `src/storage/measures.ts` and another project can supply.
 */
import type {Result} from '../sdk/result';

/**
 * The features `ThumbMeasures.java` computes on gray values flattened on white. Shares are 0 to 1,
 * grays 0 to 255, the ink box in pixels; `ms` is the decode and measure time.
 */
export type Measures = {
  width: number;
  height: number;
  mean: number;
  dark: number;
  white: number;
  mid: number;
  /** White share of the outer 5 % frame. */
  border: number;
  /** Median gray of that frame: the background. */
  borderMedian: number;
  /** Share of pixels darker than the background by 48 grays. */
  ink: number;
  inkLeft: number;
  inkTop: number;
  inkWidth: number;
  inkHeight: number;
  /** Lines of ink in the ink box (horizontal projection). */
  bands: number;
  /** Ink box width over one band's height: high for writing. */
  lineAspect: number;
  /** Ink pixels per boundary ink pixel: a stroke-width estimate. */
  thickness: number;
  /** Share of Sobel edge pixels. */
  edge: number;
  /** Area share of the box holding 98 % of the edge energy per axis (Ke 2006). */
  edgeBox: number;
  /** Distinct 12-bit colours. */
  colours: number;
  /** Share of pixels that differ from the background. */
  objectShare: number;
  ms: number;
};

/** Measures picture files; the device's is the plugin's Java module. */
export type ImageAnalyzer = {
  measure: (path: string) => Promise<Result<Measures>>;
};
