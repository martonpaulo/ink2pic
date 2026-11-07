package com.ink2pic.files;

/**
 * A perceptual hash of a thumbnail, to find near-duplicates on one page (#89): the difference
 * hash (dHash, Krawetz 2013) in both directions, then the average hash (aHash, Krawetz 2011).
 * The picture's gray, flattened on white with {@link EinkPixels#luminance}, is averaged into a
 * 9 x 9 grid; 64 bits say whether a cell is lighter than its right neighbour, 64 whether it is
 * lighter than the one below, and 64 whether a cell of the first 8 x 8 is lighter than the grid's
 * mean. Differences alone read every flat area as 0, so two flags of plain bands would match; the
 * average bits tell their tones apart. The hash is 48 hex digits; `src/search-core/duplicates.ts`
 * compares two by their bits. Plain Java on unpremultiplied ARGB pixels, no Android types, so JVM
 * tests run it.
 *
 * Cost: one pass over the pixels and 81 sums; no buffer the size of the picture.
 */
public final class PerceptualHash {
  /** Cells per side of the averaged grid: 8 differences per row and per column. */
  public static final int GRID = 9;
  private static final int CELLS = GRID - 1;
  /** Rightward differences, downward differences, and tones against the mean. */
  private static final int PASSES = 3;
  private static final int NIBBLE = 4;
  private static final int HEX = 16;

  private PerceptualHash() {}

  /** The 192-bit hash of `argb`, `width` x `height` pixels, as 48 lowercase hex digits. */
  public static String of(int[] argb, int width, int height) {
    if (width < 1 || height < 1 || argb.length < (long) width * height) {
      throw new IllegalArgumentException("bad size " + width + " x " + height);
    }
    long[] sum = new long[GRID * GRID];
    long[] count = new long[GRID * GRID];
    for (int y = 0; y < height; y++) {
      int row = (int) ((long) y * GRID / height);
      for (int x = 0; x < width; x++) {
        int cell = row * GRID + (int) ((long) x * GRID / width);
        sum[cell] += EinkPixels.luminance(argb[y * width + x]);
        count[cell]++;
      }
    }
    double[] mean = new double[GRID * GRID];
    double all = 0;
    for (int i = 0; i < mean.length; i++) {
      // A picture smaller than the grid leaves cells empty; they borrow nothing and read white.
      mean[i] = count[i] > 0 ? (double) sum[i] / count[i] : EinkPixels.WHITE;
      all += mean[i];
    }
    all /= mean.length;
    StringBuilder hex = new StringBuilder();
    int nibble = 0;
    int bits = 0;
    for (int pass = 0; pass < PASSES; pass++) {
      for (int a = 0; a < CELLS; a++) {
        for (int b = 0; b < CELLS; b++) {
          // Pass 0: row a, cell b against its right neighbour; pass 1: column a, cell b below;
          // pass 2: cell (a, b) against the grid's mean.
          int here = pass == 1 ? b * GRID + a : a * GRID + b;
          double other = pass == 2 ? all : mean[pass == 0 ? here + 1 : here + GRID];
          nibble = (nibble << 1) | (mean[here] > other ? 1 : 0);
          if (++bits == NIBBLE) {
            hex.append(Character.forDigit(nibble, HEX));
            nibble = 0;
            bits = 0;
          }
        }
      }
    }
    return hex.toString();
  }

  /** Bits that differ between two hashes of the same length. */
  public static int distance(String a, String b) {
    if (a.length() != b.length()) {
      throw new IllegalArgumentException("hashes of different lengths");
    }
    int bits = 0;
    for (int i = 0; i < a.length(); i++) {
      bits += Integer.bitCount(Character.digit(a.charAt(i), HEX) ^ Character.digit(b.charAt(i), HEX));
    }
    return bits;
  }
}
