package com.ink2pic.files;

import java.util.Random;

/**
 * Colour to gray that keeps the contrast between colours (#89): plain luma can give two hues
 * nearly the same gray, so a red and yellow flag reads as one empty box. This is the real-time
 * contrast preserving decolorization of Lu, Xu and Jia (2012): on a small copy of the picture,
 * it tries every channel weighting `(wr, wg, wb)` in tenths that sums to 1 (66 of them) and keeps
 * the one whose gray differences best match the CIELAB colour differences of pixel pairs, under
 * their bimodal energy. Rec. 601 luma is one of the candidates and the start: a weighting
 * replaces it only when it matches the colour differences strictly better, so a gray picture
 * stays as it was. Plain Java on unpremultiplied ARGB pixels, no Android types, so JVM tests run
 * it.
 *
 * Cost: one pass to make a copy of at most {@link #SAMPLE_EDGE} x {@link #SAMPLE_EDGE} pixels,
 * 66 passes over its pixel pairs, one pass to write the grays; no buffer the size of the picture.
 */
public final class Decolor {
  /** The longer side of the copy the weights are chosen on, as Lu, Xu and Jia use. */
  public static final int SAMPLE_EDGE = 64;
  /** Width of the energy's Gaussians, in gray 0 to 1 (Lu, Xu and Jia 2012). */
  public static final double SIGMA = 0.05;
  /** Weight steps: tenths. */
  private static final int STEPS = 10;
  /** The random pairs come from this seed, so the same picture always gets the same weights. */
  private static final long SEED = 89;
  /** CIELAB distances are divided by this to sit beside grays 0 to 1 (Lu, Xu and Jia code). */
  private static final double LAB_SCALE = 100 * Math.sqrt(2);
  private static final int MAX = 255;
  private static final int OPAQUE = 0xFF000000;
  /** Rec. 601 luma rounded to tenths: the start, so ties keep the usual gray. */
  private static final int[] LUMA = {3, 6, 1};

  private Decolor() {}

  /** The chosen weights in tenths, red, green and blue, for `argb`, `width` x `height`. */
  public static int[] weights(int[] argb, int width, int height) {
    if (width < 1 || height < 1 || argb.length < (long) width * height) {
      throw new IllegalArgumentException("bad size " + width + " x " + height);
    }
    int step = Math.max(1, (Math.max(width, height) + SAMPLE_EDGE - 1) / SAMPLE_EDGE);
    int w = (width + step - 1) / step;
    int h = (height + step - 1) / step;
    int n = w * h;
    double[] rgb = new double[3 * n];
    double[] lab = new double[3 * n];
    for (int y = 0; y < h; y++) {
      for (int x = 0; x < w; x++) {
        int pixel = argb[Math.min(height - 1, y * step) * width + Math.min(width - 1, x * step)];
        int i = y * w + x;
        flatRgb(pixel, rgb, 3 * i);
        toLab(rgb, 3 * i, lab);
      }
    }
    int[] pairs = pairs(w, h);
    int pairCount = pairs.length / 2;
    double[] delta = new double[pairCount];
    double[][] channel = new double[3][pairCount];
    for (int p = 0; p < pairCount; p++) {
      int a = 3 * pairs[2 * p];
      int b = 3 * pairs[2 * p + 1];
      double dl = lab[a] - lab[b];
      double da = lab[a + 1] - lab[b + 1];
      double db = lab[a + 2] - lab[b + 2];
      delta[p] = Math.sqrt(dl * dl + da * da + db * db) / LAB_SCALE;
      for (int c = 0; c < 3; c++) {
        channel[c][p] = rgb[a + c] - rgb[b + c];
      }
    }
    int[] best = LUMA.clone();
    double bestEnergy = energy(LUMA, delta, channel);
    for (int r = 0; r <= STEPS; r++) {
      for (int g = 0; g + r <= STEPS; g++) {
        int[] candidate = {r, g, STEPS - r - g};
        double e = energy(candidate, delta, channel);
        if (e < bestEnergy) {
          bestEnergy = e;
          best = candidate;
        }
      }
    }
    return best;
  }

  /**
   * Rewrites `argb`, `width` x `height` unpremultiplied pixels, in place as opaque gray pixels,
   * flattened on white, with the weights {@link #weights} chooses.
   */
  public static void apply(int[] argb, int width, int height) {
    int[] weight = weights(argb, width, height);
    int n = width * height;
    for (int i = 0; i < n; i++) {
      int pixel = argb[i];
      int alpha = (pixel >>> 24) & MAX;
      int red = EinkPixels.overWhite((pixel >> 16) & MAX, alpha);
      int green = EinkPixels.overWhite((pixel >> 8) & MAX, alpha);
      int blue = EinkPixels.overWhite(pixel & MAX, alpha);
      int gray = (red * weight[0] + green * weight[1] + blue * weight[2] + STEPS / 2) / STEPS;
      gray = Math.max(0, Math.min(MAX, gray));
      argb[i] = OPAQUE | (gray << 16) | (gray << 8) | gray;
    }
  }

  /** The bimodal energy: each gray difference should be near plus or minus its colour distance. */
  private static double energy(int[] weight, double[] delta, double[][] channel) {
    double twoSigmaSquared = 2 * SIGMA * SIGMA;
    double sum = 0;
    for (int p = 0; p < delta.length; p++) {
      double g = (weight[0] * channel[0][p] + weight[1] * channel[1][p]
          + weight[2] * channel[2][p]) / STEPS;
      double minus = g - delta[p];
      double plus = g + delta[p];
      double likely = Math.exp(-minus * minus / twoSigmaSquared)
          + Math.exp(-plus * plus / twoSigmaSquared);
      sum -= Math.log(likely + Double.MIN_NORMAL);
    }
    return sum;
  }

  /** Each pixel with its right and lower neighbour, then as many seeded random pairs. */
  private static int[] pairs(int w, int h) {
    int n = w * h;
    int neighbours = (w - 1) * h + w * (h - 1);
    int[] pairs = new int[2 * (neighbours + n)];
    int k = 0;
    for (int y = 0; y < h; y++) {
      for (int x = 0; x < w; x++) {
        int i = y * w + x;
        if (x + 1 < w) {
          pairs[k++] = i;
          pairs[k++] = i + 1;
        }
        if (y + 1 < h) {
          pairs[k++] = i;
          pairs[k++] = i + w;
        }
      }
    }
    Random random = new Random(SEED);
    for (int i = 0; i < n; i++) {
      pairs[k++] = i;
      pairs[k++] = random.nextInt(n);
    }
    return pairs;
  }

  /** Red, green and blue 0 to 1, flattened on white, into `out` at `at`. */
  private static void flatRgb(int pixel, double[] out, int at) {
    int alpha = (pixel >>> 24) & MAX;
    out[at] = EinkPixels.overWhite((pixel >> 16) & MAX, alpha) / (double) MAX;
    out[at + 1] = EinkPixels.overWhite((pixel >> 8) & MAX, alpha) / (double) MAX;
    out[at + 2] = EinkPixels.overWhite(pixel & MAX, alpha) / (double) MAX;
  }

  /** sRGB 0 to 1 at `rgb[at]` to CIELAB under D65, into `lab` at `at`. */
  private static void toLab(double[] rgb, int at, double[] lab) {
    double r = linear(rgb[at]);
    double g = linear(rgb[at + 1]);
    double b = linear(rgb[at + 2]);
    double x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
    double y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    double z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
    double fx = labF(x);
    double fy = labF(y);
    double fz = labF(z);
    lab[at] = 116 * fy - 16;
    lab[at + 1] = 500 * (fx - fy);
    lab[at + 2] = 200 * (fy - fz);
  }

  private static double linear(double c) {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  private static double labF(double t) {
    double edge = 216.0 / 24389;
    return t > edge ? Math.cbrt(t) : (24389.0 / 27 * t + 16) / 116;
  }
}
