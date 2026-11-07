package com.ink2pic.files;

import java.util.Arrays;

/** JVM tests for EinkPixels on synthetic pixels, run by `node scripts/native-build.cjs --test`. */
public final class EinkPixelsTest {
  private static int failures = 0;

  private static void check(boolean condition, String name) {
    if (!condition) {
      failures++;
      System.err.println("FAIL " + name);
    }
  }

  private static boolean isGray(int argb) {
    int r = (argb >> 16) & 0xFF;
    int g = (argb >> 8) & 0xFF;
    int b = argb & 0xFF;
    return (argb >>> 24) == 0xFF && r == g && g == b;
  }

  private static int[] eink(boolean quantize, int... argb) {
    int[] pixels = argb.clone();
    EinkPixels.toEink(pixels, quantize);
    return pixels;
  }

  public static void main(String[] args) {
    // Flattening on white.
    check(eink(false, 0x00000000)[0] == 0xFFFFFFFF, "transparent black becomes white");
    check(eink(false, 0x00FF0000)[0] == 0xFFFFFFFF, "transparent red becomes white");
    check(eink(false, 0xFF000000)[0] == 0xFF000000, "opaque black stays black");
    check(eink(false, 0xFFFFFFFF)[0] == 0xFFFFFFFF, "opaque white stays white");
    // The inserted PNG is quantized: a fully transparent pixel, of any color, still comes out
    // white there, never black (#64).
    int[] clear = eink(true, 0x00000000, 0x00FFFFFF, 0x00336699);
    check(Arrays.stream(clear).allMatch(p -> p == 0xFFFFFFFF), "transparent becomes white when quantized");
    int halfBlack = EinkPixels.luminance(0x80000000);
    check(halfBlack > 120 && halfBlack < 135, "half-transparent black is mid gray: " + halfBlack);

    // Gray output.
    int[] colors = eink(false, 0xFFFF0000, 0xFF00FF00, 0xFF0000FF, 0x7F3366CC);
    check(Arrays.stream(colors).allMatch(EinkPixelsTest::isGray), "every output pixel is opaque gray");
    check(EinkPixels.luminance(0xFF00FF00) > EinkPixels.luminance(0xFFFF0000), "green is lighter than red");
    check(EinkPixels.luminance(0xFFFF0000) > EinkPixels.luminance(0xFF0000FF), "red is lighter than blue");

    // Contrast curve.
    check(EinkPixels.contrast(0) == 0 && EinkPixels.contrast(255) == 255, "contrast keeps black and white");
    check(EinkPixels.contrast(EinkPixels.MID_GRAY) == EinkPixels.MID_GRAY, "contrast turns at mid gray");
    check(EinkPixels.contrast(200) > 200 && EinkPixels.contrast(60) < 60, "contrast stretches");

    // 16 levels.
    int[] ramp = new int[256];
    for (int i = 0; i < ramp.length; i++) {
      ramp[i] = 0xFF000000 | (i << 16) | (i << 8) | i;
    }
    EinkPixels.toEink(ramp, true);
    long levels = Arrays.stream(ramp).map(p -> p & 0xFF).distinct().count();
    check(levels == EinkPixels.LEVELS, "a full ramp quantizes to 16 levels: " + levels);
    check(Arrays.stream(ramp).allMatch(p -> (p & 0xFF) % 17 == 0), "levels are multiples of 17");
    check(EinkPixels.quantize(0) == 0 && EinkPixels.quantize(255) == 255, "quantize keeps the ends");
    check(EinkPixels.quantize(9) == 17 && EinkPixels.quantize(8) == 0, "quantize rounds to the nearest");

    // Size math.
    check(Arrays.equals(EinkPixels.targetSize(1920, 1080, 640), new int[] {640, 360}), "scales down");
    check(Arrays.equals(EinkPixels.targetSize(300, 200, 640), new int[] {300, 200}), "never scales up");
    check(Arrays.equals(EinkPixels.targetSize(640, 480, 640), new int[] {640, 480}), "same width kept");
    check(Arrays.equals(EinkPixels.targetSize(10000, 1, 640), new int[] {640, 1}), "height at least 1");
    check(EinkPixels.sampleSize(4000, 3000, 640) == 4, "sample keeps width above target");
    check(EinkPixels.sampleSize(640, 480, 640) == 1, "no sample at target width");
    check(EinkPixels.sampleSize(300, 200, 640) == 1, "no sample below target width");
    check(EinkPixels.sampleSize(700, 40000, 640) == 8, "sample fits the edge and pixel caps");
    // #81: faint light-grey lines on white get their darkest ink black; other pictures stay.
    int side = EinkPixels.MEASURE_WIDTH;
    int size = side * side;
    int[] faint = new int[size];
    Arrays.fill(faint, 0xFFFFFFFF);
    for (int x = 100; x < 300; x++) {
      faint[200 * side + x] = 0xFFB4B4B4;
    }
    check(EinkPixels.darken(faint, side, side), "faint lines are darkened");
    check((faint[200 * side + 150] & 0xFF) == 0 && (faint[0] & 0xFF) == 255,
        "their darkest ink is black and the paper stays white: " + (faint[200 * side + 150] & 0xFF));
    int[] dark = new int[size];
    Arrays.fill(dark, 0xFFFFFFFF);
    for (int x = 100; x < 300; x++) {
      dark[200 * side + x] = 0xFF202020;
    }
    check(!EinkPixels.darken(dark, side, side) && (dark[200 * side + 150] & 0xFF) == 0x20,
        "dark lines stay as they are");
    int[] paper = new int[size];
    Arrays.fill(paper, 0xFFFFFFFF);
    check(!EinkPixels.darken(paper, side, side), "white paper has nothing to darken");
    int[] fill = new int[size];
    Arrays.fill(fill, 0xFFFFFFFF);
    for (int y = 100; y < 300; y++) {
      for (int x = 100; x < 300; x++) {
        fill[y * side + x] = 0xFFB4B4B4;
      }
    }
    check(!EinkPixels.darken(fill, side, side) && (fill[200 * side + 200] & 0xFF) == 0xB4,
        "a light-grey fill is not line work and stays grey");
    if (failures > 0) {
      System.err.println(failures + " failed");
      System.exit(1);
    }
    System.out.println("EinkPixelsTest: all passed");
  }
}
