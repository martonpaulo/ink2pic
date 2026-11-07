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
  /** From this gray a pixel is paper, as {@link ThumbMeasures#WHITE_FROM} counts it. */
  public static final int PAPER_FROM = 225;
  /** The darkest ink is the gray under which this share of the non-paper pixels lie. */
  public static final double DARKEST_SHARE = 0.05;
  /** With fewer ink pixels than this there is no line work to darken. */
  public static final int MIN_INK_PIXELS = 16;
  /**
   * Line work whose darkest ink is this gray or lighter is faint on e-ink and is darkened (#81):
   * the thin light-grey maps of «Spain» on build 15. Set in the search lab (brief section 5.5).
   */
  public static final int FAINT_DARKEST = 120;
  /**
   * Strokes thinner than this, in pixels at {@link #MEASURE_WIDTH}, are lines; thicker ones are
   * fills. In the search lab every faint picture under 6 px was line work (maps, outlines, the
   * Eiffel Tower) and every one from 8.9 px a grey fill.
   */
  public static final double THIN_STROKE = 8;
  /** The thumbnail width the measures are taken at, as the device and the lab measure. */
  public static final int MEASURE_WIDTH = 400;
  /** From this white share of the frame the picture stands on paper, as `measures.ts` reads it. */
  public static final double CLEAN_BORDER = 0.85;
  /** Decode caps, as Pic2Note uses for exports (brief section 7, step 2). */
  public static final long MAX_DECODE_PIXELS = 16L * 1000 * 1000;
  public static final int MAX_DECODE_EDGE = 8192;
  /**
   * The output height cap, the page height in pixels (1920 x 2560): a tall picture capped only in
   * width reached the contour's full-size arrays at 640 x 8192, over 150 MB (#95).
   */
  public static final int MAX_OUTPUT_HEIGHT = 2560;

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

  /**
   * The darkest ink of a picture on paper: the gray below which {@link #DARKEST_SHARE} of its
   * non-paper pixels lie, so a few dark dots do not count; {@link #WHITE} with too little ink.
   */
  public static int darkest(int[] gray, int n) {
    int[] histogram = new int[WHITE + 1];
    int ink = 0;
    for (int i = 0; i < n; i++) {
      if (gray[i] < PAPER_FROM) {
        histogram[gray[i]]++;
        ink++;
      }
    }
    if (ink < MIN_INK_PIXELS) {
      return WHITE;
    }
    long reach = Math.max(1, Math.round(ink * DARKEST_SHARE));
    long seen = 0;
    for (int g = 0; g < PAPER_FROM; g++) {
      seen += histogram[g];
      if (seen >= reach) {
        return g;
      }
    }
    return WHITE;
  }

  /**
   * Whether the measured picture is faint line work (#81): thin strokes, at most
   * {@link #THIN_STROKE} px at the measure width, on paper, whose darkest ink is light grey. A
   * light-grey fill (a pastel apple, a grey silhouette) is not: darkened it turns black.
   */
  public static boolean isFaintLines(ThumbMeasures m) {
    double stroke = m.thickness * MEASURE_WIDTH / Math.max(m.width, m.height);
    return m.border >= CLEAN_BORDER
        && m.darkest >= FAINT_DARKEST
        && m.darkest < PAPER_FROM
        && stroke < THIN_STROKE;
  }

  /**
   * Darkens faint line work in place (#81): a levels stretch that makes its darkest ink black and
   * keeps paper white, so thin light-grey lines show on e-ink. Any other picture is unchanged.
   * Returns whether it changed the pixels.
   */
  public static boolean darken(int[] argb, int width, int height) {
    ThumbMeasures m = ThumbMeasures.of(argb, width, height);
    if (!isFaintLines(m)) {
      return false;
    }
    int low = m.darkest;
    double scale = (double) WHITE / (WHITE - low);
    for (int i = 0; i < width * height; i++) {
      int gray = luminance(argb[i]);
      int g = (int) Math.max(0, Math.min(WHITE, Math.round((gray - low) * scale)));
      argb[i] = OPAQUE | (g << RED_SHIFT) | (g << GREEN_SHIFT) | g;
    }
    return true;
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

  /**
   * The output size: scaled down to fit `targetWidth` and {@link #MAX_OUTPUT_HEIGHT}, keeping the
   * ratio, never scaled up.
   */
  public static int[] targetSize(int width, int height, int targetWidth) {
    double scale = Math.min((double) targetWidth / width, (double) MAX_OUTPUT_HEIGHT / height);
    if (scale >= 1) {
      return new int[] {width, height};
    }
    int scaledWidth = (int) Math.max(1, Math.min(targetWidth, Math.round(width * scale)));
    int scaledHeight =
        (int) Math.max(1, Math.min(MAX_OUTPUT_HEIGHT, Math.round(height * scale)));
    return new int[] {scaledWidth, scaledHeight};
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
