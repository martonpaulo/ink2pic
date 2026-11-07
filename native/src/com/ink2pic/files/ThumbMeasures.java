package com.ink2pic.files;

/**
 * Cheap pixel measures of one thumbnail (research note 2026-11-search-ranking sections 3 and 4,
 * research D on iconic pictures, #66): plain Java on unpremultiplied ARGB pixels, no Android
 * types, so JVM tests run it and another project can reuse it. Each pixel is flattened on white
 * with the luma of {@link EinkPixels#luminance}. The measures are features only: the classes and
 * the score that read them live in one place, `src/search/measures.ts`.
 *
 * Cost: three passes over the pixels and three arrays the size of the picture's width and height;
 * no buffer the size of the picture besides the gray values (one int per pixel). The fields are
 * set once, by the passes of {@link #of}, and only read afterwards.
 */
public final class ThumbMeasures {
  /** Below this gray a pixel is dark: dark paintings, night scenes. */
  public static final int DARK_BELOW = 80;
  /** From this gray a pixel is white: paper. */
  public static final int WHITE_FROM = 225;
  /** Mid grays, which turn muddy on 16 levels (research D, section 3). */
  public static final int MID_FROM = 41;
  public static final int MID_TO = 214;
  /** The frame is this share of each side (research section 3). */
  public static final int FRAME_PERCENT = 5;
  /**
   * Ink is this much darker than the frame's median gray, so light-gray line art counts too
   * (research D, failure 3).
   */
  public static final int INK_MARGIN = 48;
  /** An object pixel differs from the frame's median gray by more than this (research D). */
  public static final int OBJECT_MARGIN = 24;
  /** Sobel L1 magnitude above which a pixel is an edge (research section 3). */
  public static final int EDGE_ABOVE = 128;
  /** Share of Laplacian edge energy trimmed on each side of each axis: 98 % kept (Ke 2006). */
  public static final double EDGE_TRIM = 0.01;
  /** A row holds ink when at least this share of the ink box's width is ink. */
  public static final int BAND_ROW_PERCENT = 1;
  /** 12-bit colours: four bits per channel. */
  private static final int COLOUR_BITS = 4;
  private static final int COLOURS = 1 << (3 * COLOUR_BITS);
  private static final int GRAYS = 256;
  private static final int PERCENT = 100;

  public final int width;
  public final int height;
  /** Mean gray, 0 to 255. */
  public double mean;
  /** Shares of all pixels, 0 to 1. */
  public double dark;
  public double white;
  public double mid;
  /** Share of white pixels in the outer frame. */
  public double border;
  /** Median gray of the outer frame: the background. */
  public int borderMedian;
  /** Share of ink pixels: darker than the background by {@link #INK_MARGIN}. */
  public double ink;
  /** The tight box around the ink, in pixels; all zero without ink. */
  public int inkLeft;
  public int inkTop;
  public int inkWidth;
  public int inkHeight;
  /** Runs of ink rows in the ink box: lines of writing (horizontal projection). */
  public int bands;
  /** Ink box width over the height of one band: high for one or more lines of writing. */
  public double lineAspect;
  /** Ink pixels per boundary ink pixel: a stroke-width estimate; 0 without ink. */
  public double thickness;
  /** Share of pixels that are Sobel edges. */
  public double edge;
  /** Area share of the box holding 98 % of the Laplacian edge energy per axis (Ke 2006). */
  public double edgeBox;
  /** Distinct 12-bit colours (Athitsos 1997). */
  public int colours;
  /** Share of pixels that differ from the background: near zero for a blank thumbnail. */
  public double objectShare;
  /**
   * The darkest ink, by {@link EinkPixels#darkest}: light grey for faint line work, which the
   * insert darkens (#81); 255 without ink.
   */
  public int darkest;
  /** Faint line work, which the insert darkens: {@link EinkPixels#isFaintLines} (#81). */
  public boolean faintLines;

  private ThumbMeasures(int width, int height) {
    this.width = width;
    this.height = height;
  }

  /** Measures `argb`, `width` x `height` unpremultiplied pixels; `argb` is left unchanged. */
  public static ThumbMeasures of(int[] argb, int width, int height) {
    if (width < 1 || height < 1 || argb.length < (long) width * height) {
      throw new IllegalArgumentException("bad size " + width + " x " + height);
    }
    int n = width * height;
    int[] gray = new int[n];
    ThumbMeasures b = new ThumbMeasures(width, height);
    tones(argb, gray, b);
    frame(gray, b);
    inkAndObject(gray, b);
    edges(gray, b);
    b.faintLines = EinkPixels.isFaintLines(b);
    return b;
  }

  /** Pass 1: gray values, mean, dark, white and mid shares, colour count. */
  private static void tones(int[] argb, int[] gray, ThumbMeasures b) {
    boolean[] seen = new boolean[COLOURS];
    long sum = 0;
    int dark = 0;
    int white = 0;
    int mid = 0;
    int colours = 0;
    for (int i = 0; i < gray.length; i++) {
      int pixel = argb[i];
      int alpha = (pixel >>> 24) & 0xFF;
      int red = EinkPixels.overWhite((pixel >> 16) & 0xFF, alpha);
      int green = EinkPixels.overWhite((pixel >> 8) & 0xFF, alpha);
      int blue = EinkPixels.overWhite(pixel & 0xFF, alpha);
      int colour = ((red >> COLOUR_BITS) << (2 * COLOUR_BITS))
          | ((green >> COLOUR_BITS) << COLOUR_BITS) | (blue >> COLOUR_BITS);
      if (!seen[colour]) {
        seen[colour] = true;
        colours++;
      }
      int g = EinkPixels.luminance(pixel);
      gray[i] = g;
      sum += g;
      if (g < DARK_BELOW) {
        dark++;
      }
      if (g >= WHITE_FROM) {
        white++;
      }
      if (g >= MID_FROM && g <= MID_TO) {
        mid++;
      }
    }
    double n = gray.length;
    b.mean = sum / n;
    b.dark = dark / n;
    b.white = white / n;
    b.mid = mid / n;
    b.colours = colours;
  }

  /** The outer frame: its white share and its median gray. */
  private static void frame(int[] gray, ThumbMeasures b) {
    int w = b.width;
    int h = b.height;
    int fx = Math.max(1, w * FRAME_PERCENT / PERCENT);
    int fy = Math.max(1, h * FRAME_PERCENT / PERCENT);
    int[] histogram = new int[GRAYS];
    int count = 0;
    int white = 0;
    for (int y = 0; y < h; y++) {
      boolean edgeRow = y < fy || y >= h - fy;
      for (int x = 0; x < w; x++) {
        if (edgeRow || x < fx || x >= w - fx) {
          int g = gray[y * w + x];
          histogram[g]++;
          count++;
          if (g >= WHITE_FROM) {
            white++;
          }
        }
      }
    }
    b.border = (double) white / count;
    int half = (count + 1) / 2;
    int seen = 0;
    for (int g = 0; g < GRAYS; g++) {
      seen += histogram[g];
      if (seen >= half) {
        b.borderMedian = g;
        break;
      }
    }
  }

  private static boolean isInk(int gray, int below) {
    return gray < below;
  }

  /** Pass 2: ink share, ink box, stroke thickness, object share; then the bands of the box. */
  private static void inkAndObject(int[] gray, ThumbMeasures b) {
    int w = b.width;
    int h = b.height;
    int below = b.borderMedian - INK_MARGIN;
    int[] rowInk = new int[h];
    int ink = 0;
    int boundary = 0;
    int object = 0;
    int left = w;
    int top = h;
    int right = -1;
    int bottom = -1;
    for (int y = 0; y < h; y++) {
      for (int x = 0; x < w; x++) {
        int i = y * w + x;
        int g = gray[i];
        if (Math.abs(g - b.borderMedian) > OBJECT_MARGIN) {
          object++;
        }
        if (!isInk(g, below)) {
          continue;
        }
        ink++;
        rowInk[y]++;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        boolean inside = x > 0 && y > 0 && x < w - 1 && y < h - 1
            && isInk(gray[i - 1], below) && isInk(gray[i + 1], below)
            && isInk(gray[i - w], below) && isInk(gray[i + w], below);
        if (!inside) {
          boundary++;
        }
      }
    }
    double n = (double) w * h;
    b.ink = ink / n;
    b.objectShare = object / n;
    b.darkest = EinkPixels.darkest(gray, w * h);
    b.thickness = boundary == 0 ? 0 : (double) ink / boundary;
    if (ink == 0) {
      return;
    }
    b.inkLeft = left;
    b.inkTop = top;
    b.inkWidth = right - left + 1;
    b.inkHeight = bottom - top + 1;
    int rowMin = Math.max(1, b.inkWidth * BAND_ROW_PERCENT / PERCENT);
    int bands = 0;
    boolean inBand = false;
    for (int y = top; y <= bottom; y++) {
      boolean inkRow = rowInk[y] >= rowMin;
      if (inkRow && !inBand) {
        bands++;
      }
      inBand = inkRow;
    }
    b.bands = Math.max(1, bands);
    b.lineAspect = b.inkWidth / ((double) b.inkHeight / b.bands);
  }

  /** Pass 3, interior pixels: Sobel edge share and the Laplacian edge-energy box. */
  private static void edges(int[] gray, ThumbMeasures b) {
    int w = b.width;
    int h = b.height;
    if (w < 3 || h < 3) {
      return;
    }
    long[] columns = new long[w];
    long[] rows = new long[h];
    long total = 0;
    int edges = 0;
    for (int y = 1; y < h - 1; y++) {
      for (int x = 1; x < w - 1; x++) {
        int i = y * w + x;
        int nw = gray[i - w - 1];
        int n = gray[i - w];
        int ne = gray[i - w + 1];
        int west = gray[i - 1];
        int c = gray[i];
        int east = gray[i + 1];
        int sw = gray[i + w - 1];
        int s = gray[i + w];
        int se = gray[i + w + 1];
        int gx = (ne + 2 * east + se) - (nw + 2 * west + sw);
        int gy = (sw + 2 * s + se) - (nw + 2 * n + ne);
        if (Math.abs(gx) + Math.abs(gy) > EDGE_ABOVE) {
          edges++;
        }
        int energy = Math.abs(4 * c - n - s - west - east);
        columns[x] += energy;
        rows[y] += energy;
        total += energy;
      }
    }
    b.edge = (double) edges / ((double) w * h);
    if (total == 0) {
      return;
    }
    b.edgeBox = (double) span(columns, total) * span(rows, total) / ((double) w * h);
  }

  /** How many slots hold the middle 98 % of `total`, trimming 1 % on each side. */
  private static int span(long[] energy, long total) {
    double cut = total * EDGE_TRIM;
    int first = 0;
    long seen = 0;
    while (first < energy.length - 1 && seen + energy[first] <= cut) {
      seen += energy[first];
      first++;
    }
    int last = energy.length - 1;
    seen = 0;
    while (last > first && seen + energy[last] <= cut) {
      seen += energy[last];
      last--;
    }
    return last - first + 1;
  }
}
