package com.ink2pic.files;

/** JVM tests for Decolor on synthetic two-colour pictures, run by `node scripts/native-build.cjs --test`. */
public final class DecolorTest {
  private static int failures = 0;

  private static void check(boolean condition, String name) {
    if (!condition) {
      failures++;
      System.err.println("FAIL " + name);
    }
  }

  /** A `w` x `h` picture: bands of `outer`, a middle half of `middle`, as the flag of Spain. */
  private static int[] flag(int w, int h, int outer, int middle) {
    int[] argb = new int[w * h];
    for (int y = 0; y < h; y++) {
      int colour = y >= h / 4 && y < h - h / 4 ? middle : outer;
      for (int x = 0; x < w; x++) {
        argb[y * w + x] = colour;
      }
    }
    return argb;
  }

  private static int gray(int argb) {
    return argb & 0xFF;
  }

  private static boolean isGray(int argb) {
    int r = (argb >> 16) & 0xFF;
    int g = (argb >> 8) & 0xFF;
    return (argb >>> 24) == 0xFF && r == g && g == (argb & 0xFF);
  }

  public static void main(String[] args) {
    int w = 120;
    int h = 80;
    // Spain: red bands and a yellow middle become dark bands and a light middle.
    int[] spain = flag(w, h, 0xFFAD1519, 0xFFFABD00);
    Decolor.apply(spain, w, h);
    int red = gray(spain[0]);
    int yellow = gray(spain[(h / 2) * w]);
    check(isGray(spain[0]) && isGray(spain[(h / 2) * w]), "output is opaque gray");
    check(yellow - red >= 120, "red and yellow are far apart: " + red + " and " + yellow);
    check(red < 100, "red bands are dark: " + red);
    check(yellow > 160, "yellow middle is light: " + yellow);

    // Two hues of the same luma: luma gives one gray, the decolorization two.
    int pure = 0xFFFF0000;
    int green = 0xFF008200;
    check(Math.abs(EinkPixels.luminance(pure) - EinkPixels.luminance(green)) <= 2,
        "the pair has the same luma");
    int[] same = flag(w, h, pure, green);
    Decolor.apply(same, w, h);
    int a = gray(same[0]);
    int b = gray(same[(h / 2) * w]);
    check(Math.abs(a - b) >= 60, "same-luma red and green get different grays: " + a + " and " + b);

    // A gray picture keeps its grays: luma is the start and nothing beats it.
    int[] grays = flag(w, h, 0xFF404040, 0xFFC0C0C0);
    Decolor.apply(grays, w, h);
    check(gray(grays[0]) == 0x40 && gray(grays[(h / 2) * w]) == 0xC0, "gray stays as it was");
    int[] weights = Decolor.weights(flag(w, h, 0xFF404040, 0xFFC0C0C0), w, h);
    check(weights[0] == 3 && weights[1] == 6 && weights[2] == 1, "a gray picture keeps luma weights");

    // Transparent pixels are flattened on white.
    int[] clear = {0x00000000, 0xFF000000};
    Decolor.apply(clear, 2, 1);
    check(clear[0] == 0xFFFFFFFF && clear[1] == 0xFF000000, "transparent becomes white, black stays");

    // Same picture, same weights: the pairs come from a fixed seed.
    int[] big = flag(640, 400, 0xFF1E50A0, 0xFFF0C814);
    int[] first = Decolor.weights(big, 640, 400);
    int[] again = Decolor.weights(big, 640, 400);
    check(java.util.Arrays.equals(first, again), "weights are deterministic");

    try {
      Decolor.apply(new int[1], 2, 2);
      check(false, "a short buffer is refused");
    } catch (IllegalArgumentException expected) {
      // refused, as it should be
    }
    if (failures > 0) {
      System.exit(1);
    }
    System.out.println("DecolorTest passed");
  }
}
