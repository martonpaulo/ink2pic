package com.ink2pic.files;

import java.util.Arrays;

/** JVM tests for Contour on synthetic pixels, run by `node scripts/native-build.cjs --test`. */
public final class ContourTest {
  private static final int WHITE = 0xFFFFFFFF;
  private static final int BLACK = 0xFF000000;
  private static final int SIZE = 64;
  private static int failures = 0;

  private static void check(boolean condition, String name) {
    if (!condition) {
      failures++;
      System.err.println("FAIL " + name);
    }
  }

  private static int gray(int[] pixels, int x, int y) {
    return pixels[y * SIZE + x] & 0xFF;
  }

  private static int[] filled(int argb) {
    int[] pixels = new int[SIZE * SIZE];
    Arrays.fill(pixels, argb);
    return pixels;
  }

  private static void rect(int[] pixels, int left, int top, int width, int height, int argb) {
    for (int y = top; y < top + height; y++) {
      for (int x = left; x < left + width; x++) {
        pixels[y * SIZE + x] = argb;
      }
    }
  }

  private static boolean opaqueGray(int[] pixels) {
    return Arrays.stream(pixels).allMatch(p -> (p >>> 24) == 0xFF
        && ((p >> 16) & 0xFF) == (p & 0xFF) && ((p >> 8) & 0xFF) == (p & 0xFF));
  }

  public static void main(String[] args) {
    int[] square = filled(WHITE);
    rect(square, 16, 16, 32, 32, BLACK);
    Contour.apply(square, SIZE, SIZE);
    check(opaqueGray(square), "the contour is opaque gray");
    check(gray(square, 32, 32) == 255, "a flat dark area becomes white inside");
    check(gray(square, 4, 4) == 255, "paper stays white");
    check(gray(square, 17, 32) < 128, "the inner side of the edge is ink: " + gray(square, 17, 32));

    // A dark painting: a slightly lighter face on a near-black canvas; the stretch finds it.
    int[] painting = filled(0xFF101010);
    rect(painting, 20, 20, 24, 24, 0xFF303030);
    Contour.apply(painting, SIZE, SIZE);
    check(gray(painting, 4, 4) == 255 && gray(painting, 32, 32) == 255,
        "a dark painting becomes white paper");
    check(gray(painting, 21, 32) < 128 || gray(painting, 19, 32) < 128,
        "the stretched edge of a dark painting is drawn");

    // At the insert width a lone dot is a speck.
    int wide = Contour.SPECK_WIDTH;
    int[] dot = new int[wide * SIZE];
    Arrays.fill(dot, WHITE);
    dot[(SIZE / 2) * wide + wide / 2] = BLACK;
    Contour.apply(dot, wide, SIZE);
    check(Arrays.stream(dot).allMatch(p -> p == WHITE), "a lone dot is a speck and goes");

    int[] flat = filled(0xFF404040);
    Contour.apply(flat, SIZE, SIZE);
    check(Arrays.stream(flat).allMatch(p -> p == WHITE), "a flat picture has no contour");

    int[] specks = filled(WHITE);
    rect(specks, 2, 2, 2, 2, BLACK);
    rect(specks, 10, 10, 3, 3, BLACK);
    Contour.removeSpecks(specks, SIZE, SIZE, 8, 1);
    check(gray(specks, 2, 2) == 255, "a 4-pixel part under 8 is removed");
    check(gray(specks, 11, 11) == 0, "a 9-pixel part stays");

    // #83: a short fragment of hatching goes, a long thin stroke of the same width stays.
    int[] strokes = filled(WHITE);
    rect(strokes, 4, 10, 6, 1, BLACK);
    rect(strokes, 4, 30, 40, 1, BLACK);
    Contour.removeSpecks(strokes, SIZE, SIZE, 1, Contour.fragmentSize(SIZE, SIZE) * 4);
    check(gray(strokes, 6, 10) == 255, "a short fragment is removed");
    check(gray(strokes, 20, 30) == 0, "a long thin stroke stays");
    check(Contour.fragmentSize(400, 300) == 16, "fragments are under 4 % of the longer side");

    // #83: grain (lone dark pixels) fades under the median, before the edge pass draws it.
    float[] grain = new float[SIZE * SIZE];
    float[] smooth = new float[SIZE * SIZE];
    Arrays.fill(grain, 1f);
    for (int y = 2; y < SIZE; y += 3) {
      for (int x = 2; x < SIZE; x += 3) {
        grain[y * SIZE + x] = 0f;
      }
    }
    Contour.median(grain, smooth, SIZE, SIZE);
    boolean clean = true;
    for (float v : smooth) {
      clean &= v == 1f;
    }
    check(clean, "lone dark pixels are gone after one median pass");

    // #83: a one-pixel line becomes three pixels wide, legible on e-ink.
    int[] thin = filled(WHITE);
    rect(thin, 10, 20, 30, 1, BLACK);
    Contour.thicken(thin, SIZE, SIZE);
    check(gray(thin, 20, 19) == 0 && gray(thin, 20, 21) == 0 && gray(thin, 20, 23) == 255,
        "a line is one pixel wider on each side");

    // #83: a hatched square becomes its outline, not a field of dots.
    int[] hatched = filled(WHITE);
    for (int y = 16; y < 48; y++) {
      for (int x = 16; x < 48; x += 2) {
        hatched[y * SIZE + x] = BLACK;
      }
    }
    Contour.apply(hatched, SIZE, SIZE);
    long ink = Arrays.stream(hatched).filter(p -> (p & 0xFF) < 128).count();
    check(gray(hatched, 32, 32) == 255, "the hatched inside becomes white: " + gray(hatched, 32, 32));
    check(ink > 0 && ink < SIZE * SIZE / 4, "a hatched square keeps an outline only: " + ink);

    // #89: a diagonal edge keeps gray ramps, never a hard black-and-white stair step.
    int[] diagonal = filled(WHITE);
    for (int y = 0; y < SIZE; y++) {
      for (int x = 0; x < SIZE; x++) {
        if (x < y) {
          diagonal[y * SIZE + x] = BLACK;
        }
      }
    }
    Contour.apply(diagonal, SIZE, SIZE);
    int ramp = 0;
    int jump = 0;
    for (int y = 0; y < SIZE; y++) {
      for (int x = 0; x < SIZE; x++) {
        int g = gray(diagonal, x, y);
        if (g > 0 && g < 255) {
          ramp++;
        }
        if (x + 1 < SIZE) {
          jump = Math.max(jump, Math.abs(g - gray(diagonal, x + 1, y)));
        }
        if (y + 1 < SIZE) {
          jump = Math.max(jump, Math.abs(g - gray(diagonal, x, y + 1)));
        }
      }
    }
    check(ramp >= SIZE, "a diagonal's contour has intermediate grays: " + ramp);
    check(jump < 255, "no neighbour goes straight from black to white: " + jump);

    check(Contour.speckSize(640) == 8 && Contour.speckSize(320) == 2
        && Contour.speckSize(10) == 1, "the speck size follows the area");

    boolean refused = false;
    try {
      Contour.apply(new int[3], 2, 2);
    } catch (IllegalArgumentException expected) {
      refused = true;
    }
    check(refused, "a pixel array shorter than the size is refused");

    if (failures > 0) {
      System.err.println(failures + " failed");
      System.exit(1);
    }
    System.out.println("ContourTest: all passed");
  }
}
