package com.ink2pic.files;

/** JVM tests for PerceptualHash on synthetic pictures, run by `node scripts/native-build.cjs --test`. */
public final class PerceptualHashTest {
  private static int failures = 0;

  private static void check(boolean condition, String name) {
    if (!condition) {
      failures++;
      System.err.println("FAIL " + name);
    }
  }

  /** A `w` x `h` picture: a dark disc at (cx, cy) of radius r on white, with a gradient sky. */
  private static int[] scene(int w, int h, double cx, double cy, double r) {
    int[] argb = new int[w * h];
    for (int y = 0; y < h; y++) {
      for (int x = 0; x < w; x++) {
        double dx = x - cx * w;
        double dy = y - cy * h;
        int g = dx * dx + dy * dy < r * r * w * w ? 30 : 140 + 100 * y / h;
        argb[y * w + x] = 0xFF000000 | (g << 16) | (g << 8) | g;
      }
    }
    return argb;
  }

  private static int[] bands(int w, int h, int... colours) {
    int[] argb = new int[w * h];
    for (int y = 0; y < h; y++) {
      for (int x = 0; x < w; x++) {
        argb[y * w + x] = colours[y * colours.length / h];
      }
    }
    return argb;
  }

  public static void main(String[] args) {
    String one = PerceptualHash.of(scene(330, 220, 0.3, 0.4, 0.15), 330, 220);
    check(one.length() == 48 && one.matches("[0-9a-f]+"), "48 hex digits: " + one);
    String same = PerceptualHash.of(scene(330, 220, 0.3, 0.4, 0.15), 330, 220);
    check(PerceptualHash.distance(one, same) == 0, "identical pictures, identical hashes");
    // The same picture at another size (a 400 px copy) stays near.
    String larger = PerceptualHash.of(scene(400, 267, 0.3, 0.4, 0.15), 400, 267);
    int near = PerceptualHash.distance(one, larger);
    check(near <= 12, "a resized copy is near: " + near);
    String other = PerceptualHash.of(scene(330, 220, 0.75, 0.7, 0.2), 330, 220);
    int far = PerceptualHash.distance(one, other);
    check(far > 12, "a different picture is far: " + far);
    // Two flags of plain horizontal bands differ through the tone bits.
    String germany = PerceptualHash.of(bands(300, 180, 0xFF000000, 0xFFDD0000, 0xFFFFCE00), 300, 180);
    String russia = PerceptualHash.of(bands(300, 180, 0xFFFFFFFF, 0xFF0039A6, 0xFFD52B1E), 300, 180);
    int flags = PerceptualHash.distance(germany, russia);
    check(flags > 12, "different banded flags are far: " + flags);
    check(PerceptualHash.of(new int[] {0xFF000000}, 1, 1).length() == 48, "a 1 px picture has a hash");
    if (failures > 0) {
      System.exit(1);
    }
    System.out.println("PerceptualHashTest passed");
  }
}
