package com.ink2pic.files;

/**
 * Turns a photo or a dark painting into a contour drawing for e-ink (#66, owner decision D5 A;
 * research note 2026-11-search-ranking section 5): a 1 %/99 % contrast stretch, then XDoG in its
 * tau form (Winnemöller, Kyprianidis and Olsen 2012) with the sharp parameters, then removal of
 * ink specks. Plain Java on unpremultiplied ARGB pixels, no Android types, so JVM tests run it.
 *
 * Memory: four float arrays and one byte array the size of the picture, about 17 bytes per pixel
 * (9 MB at 640 x 840), plus a stack that grows only to the largest ink part.
 */
public final class Contour {
  public static final double SIGMA = 1.0;
  public static final double K = 1.6;
  public static final double TAU = 0.98;
  public static final double EPSILON = 0;
  public static final double PHI = 200;
  /** The stretch maps the gray at 1 % of the pixels to black and the one at 99 % to white. */
  public static final double STRETCH_LOW = 0.01;
  public static final double STRETCH_HIGH = 0.99;
  /** Ink parts smaller than this are specks at the insert width (640 px), and become white. */
  public static final int SPECK_PIXELS = 8;
  public static final int SPECK_WIDTH = 640;
  /** Gaussian kernels reach this many sigmas. */
  private static final double KERNEL_SIGMAS = 3;
  private static final int GRAYS = 256;
  private static final int MAX = 255;
  private static final int INK_BELOW = EinkPixels.MID_GRAY;
  private static final int OPAQUE = 0xFF000000;
  private static final int FIRST_STACK = 1024;

  private Contour() {}

  /** Rewrites `argb`, `width` x `height` pixels, in place as an opaque gray contour drawing. */
  public static void apply(int[] argb, int width, int height) {
    int n = width * height;
    if (width < 1 || height < 1 || argb.length < n) {
      throw new IllegalArgumentException("bad size " + width + " x " + height);
    }
    float[] gray = stretched(argb, n);
    float[] tmp = new float[n];
    float[] fine = new float[n];
    float[] coarse = new float[n];
    blur(gray, fine, tmp, width, height, SIGMA);
    blur(gray, coarse, tmp, width, height, SIGMA * K);
    for (int i = 0; i < n; i++) {
      double d = fine[i] - TAU * coarse[i];
      double t = d >= EPSILON ? 1 : 1 + Math.tanh(PHI * (d - EPSILON));
      int level = (int) Math.max(0, Math.min(MAX, Math.round(t * MAX)));
      argb[i] = OPAQUE | (level << 16) | (level << 8) | level;
    }
    removeSpecks(argb, width, height, speckSize(width));
  }

  /** The speck size at this width: {@link #SPECK_PIXELS} at 640 px, by area; at least 1. */
  static int speckSize(int width) {
    double scale = (double) width / SPECK_WIDTH;
    return (int) Math.max(1, Math.round(SPECK_PIXELS * scale * scale));
  }

  /** Gray 0 to 1, flattened on white, stretched so 1 % of pixels are black and 1 % white. */
  private static float[] stretched(int[] argb, int n) {
    int[] histogram = new int[GRAYS];
    int[] luma = new int[n];
    for (int i = 0; i < n; i++) {
      luma[i] = EinkPixels.luminance(argb[i]);
      histogram[luma[i]]++;
    }
    int low = level(histogram, n * STRETCH_LOW);
    int high = level(histogram, n * STRETCH_HIGH);
    float[] gray = new float[n];
    float range = high > low ? high - low : MAX;
    int base = high > low ? low : 0;
    for (int i = 0; i < n; i++) {
      gray[i] = Math.max(0f, Math.min(1f, (luma[i] - base) / range));
    }
    return gray;
  }

  /** The first gray whose cumulative count passes `count`. */
  private static int level(int[] histogram, double count) {
    long seen = 0;
    for (int g = 0; g < GRAYS; g++) {
      seen += histogram[g];
      if (seen > count) {
        return g;
      }
    }
    return MAX;
  }

  private static float[] kernel(double sigma) {
    int radius = (int) Math.ceil(KERNEL_SIGMAS * sigma);
    float[] weights = new float[2 * radius + 1];
    double sum = 0;
    for (int x = -radius; x <= radius; x++) {
      double w = Math.exp(-(x * x) / (2 * sigma * sigma));
      weights[x + radius] = (float) w;
      sum += w;
    }
    for (int i = 0; i < weights.length; i++) {
      weights[i] /= (float) sum;
    }
    return weights;
  }

  /** A separable Gaussian blur of `src` into `dst`, through `tmp`; edges are clamped. */
  private static void blur(float[] src, float[] dst, float[] tmp, int w, int h, double sigma) {
    float[] k = kernel(sigma);
    int r = k.length / 2;
    for (int y = 0; y < h; y++) {
      int row = y * w;
      for (int x = 0; x < w; x++) {
        float sum = 0;
        for (int j = -r; j <= r; j++) {
          int xx = Math.max(0, Math.min(w - 1, x + j));
          sum += k[j + r] * src[row + xx];
        }
        tmp[row + x] = sum;
      }
    }
    for (int y = 0; y < h; y++) {
      for (int x = 0; x < w; x++) {
        float sum = 0;
        for (int j = -r; j <= r; j++) {
          int yy = Math.max(0, Math.min(h - 1, y + j));
          sum += k[j + r] * tmp[yy * w + x];
        }
        dst[y * w + x] = sum;
      }
    }
  }

  private static boolean isInk(int argb) {
    return (argb & 0xFF) < INK_BELOW;
  }

  /** Whitens every 8-connected ink part smaller than `minPixels`. */
  static void removeSpecks(int[] argb, int w, int h, int minPixels) {
    byte[] seen = new byte[w * h];
    int[] stack = new int[FIRST_STACK];
    int[] part = new int[minPixels];
    for (int start = 0; start < w * h; start++) {
      if (seen[start] != 0 || !isInk(argb[start])) {
        continue;
      }
      seen[start] = 1;
      int top = 0;
      stack[top++] = start;
      int size = 0;
      while (top > 0) {
        int i = stack[--top];
        if (size < minPixels) {
          part[size] = i;
        }
        size++;
        int x = i % w;
        int y = i / w;
        for (int dy = -1; dy <= 1; dy++) {
          for (int dx = -1; dx <= 1; dx++) {
            int nx = x + dx;
            int ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
              continue;
            }
            int j = ny * w + nx;
            if (seen[j] == 0 && isInk(argb[j])) {
              seen[j] = 1;
              if (top == stack.length) {
                stack = java.util.Arrays.copyOf(stack, stack.length * 2);
              }
              stack[top++] = j;
            }
          }
        }
      }
      if (size < minPixels) {
        for (int p = 0; p < size; p++) {
          argb[part[p]] = OPAQUE | (MAX << 16) | (MAX << 8) | MAX;
        }
      }
    }
  }
}
