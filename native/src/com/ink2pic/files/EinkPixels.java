package com.ink2pic.files;

/**
 * Pixel and size math for a picture shown on the 16-gray e-ink screen (brief section 7, issue #17).
 * Plain Java, no Android types, so JVM tests run it.
 */
public final class EinkPixels {
  public static final int WHITE = 255;
  /** Gray levels the Manta screen shows (brief section 7, step 5). */
  public static final int LEVELS = 16;
  /** Middle of the gray range; the contrast curve turns around it. */
  public static final int MID_GRAY = 128;
  /**
   * Slope of the contrast curve: light grays move to white and dark grays to black, so thin lines
   * stay visible on e-ink. [INFERENCE, to calibrate on device]
   */
  public static final double CONTRAST = 1.25;
  /** Decode caps, as Pic2Note uses for exports (brief section 7, step 2). */
  public static final long MAX_DECODE_PIXELS = 16L * 1000 * 1000;
  public static final int MAX_DECODE_EDGE = 8192;

  /** Rec. 601 luma weights, in thousandths. */
  private static final int RED_WEIGHT = 299;
  private static final int GREEN_WEIGHT = 587;
  private static final int BLUE_WEIGHT = 114;
  private static final int WEIGHT_TOTAL = 1000;
  private static final int CHANNEL_MASK = 0xFF;
  private static final int OPAQUE = 0xFF000000;
  private static final int ALPHA_SHIFT = 24;
  private static final int RED_SHIFT = 16;
  private static final int GREEN_SHIFT = 8;

  private EinkPixels() {}

  /** One channel drawn with `alpha` over white: a transparent pixel becomes white. */
  static int overWhite(int channel, int alpha) {
    return (channel * alpha + WHITE * (WHITE - alpha) + WHITE / 2) / WHITE;
  }

  /** The gray of an unpremultiplied ARGB pixel flattened on white. */
  public static int luminance(int argb) {
    int alpha = (argb >>> ALPHA_SHIFT) & CHANNEL_MASK;
    int red = overWhite((argb >> RED_SHIFT) & CHANNEL_MASK, alpha);
    int green = overWhite((argb >> GREEN_SHIFT) & CHANNEL_MASK, alpha);
    int blue = overWhite(argb & CHANNEL_MASK, alpha);
    return (red * RED_WEIGHT + green * GREEN_WEIGHT + blue * BLUE_WEIGHT + WEIGHT_TOTAL / 2)
        / WEIGHT_TOTAL;
  }

  /** A linear stretch around the middle gray, clamped, so white stays white. */
  public static int contrast(int gray) {
    long stretched = Math.round(MID_GRAY + (gray - MID_GRAY) * CONTRAST);
    return (int) Math.max(0, Math.min(WHITE, stretched));
  }

  /** The nearest of the screen's gray levels, so 0 and 255 stay exact. */
  public static int quantize(int gray) {
    int step = WHITE / (LEVELS - 1);
    return Math.round((float) gray / step) * step;
  }

  /** Rewrites `argb` in place as opaque gray pixels, flattened on white with the e-ink curve. */
  public static void toEink(int[] argb, boolean quantize) {
    for (int i = 0; i < argb.length; i++) {
      int gray = contrast(luminance(argb[i]));
      if (quantize) {
        gray = quantize(gray);
      }
      argb[i] = OPAQUE | (gray << RED_SHIFT) | (gray << GREEN_SHIFT) | gray;
    }
  }

  /** The output size: scaled down to `targetWidth`, keeping the ratio, never scaled up. */
  public static int[] targetSize(int width, int height, int targetWidth) {
    if (width <= targetWidth) {
      return new int[] {width, height};
    }
    int scaledHeight = (int) Math.max(1, Math.round((double) height * targetWidth / width));
    return new int[] {targetWidth, scaledHeight};
  }

  /**
   * The largest power-of-two `inSampleSize` that keeps the decoded width at or above `targetWidth`,
   * raised further until the decode fits the pixel and edge caps.
   */
  public static int sampleSize(int width, int height, int targetWidth) {
    int sample = 1;
    while (width / (sample * 2) >= targetWidth) {
      sample *= 2;
    }
    while ((long) (width / sample) * (height / sample) > MAX_DECODE_PIXELS
        || Math.max(width, height) / sample > MAX_DECODE_EDGE) {
      sample *= 2;
    }
    return sample;
  }
}
