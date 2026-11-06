package com.ink2pic.files;

/** JVM tests for ThumbMeasures on synthetic pixels, run by `node scripts/native-build.cjs --test`. */
public final class ThumbMeasuresTest {
  private static final int WHITE = 0xFFFFFFFF;
  private static final int BLACK = 0xFF000000;
  private static final int SIZE = 100;
  private static int failures = 0;

  private static void check(boolean condition, String name) {
    if (!condition) {
      failures++;
      System.err.println("FAIL " + name);
    }
  }

  private static int gray(int level) {
    return 0xFF000000 | (level << 16) | (level << 8) | level;
  }

  private static int[] filled(int argb) {
    int[] pixels = new int[SIZE * SIZE];
    java.util.Arrays.fill(pixels, argb);
    return pixels;
  }

  private static void rect(int[] pixels, int left, int top, int width, int height, int argb) {
    for (int y = top; y < top + height; y++) {
      for (int x = left; x < left + width; x++) {
        pixels[y * SIZE + x] = argb;
      }
    }
  }

  /** A square drawn as a 2 px outline: line art on white. */
  private static int[] outline(int argb) {
    int[] pixels = filled(WHITE);
    rect(pixels, 30, 30, 40, 2, argb);
    rect(pixels, 30, 68, 40, 2, argb);
    rect(pixels, 30, 30, 2, 40, argb);
    rect(pixels, 68, 30, 2, 40, argb);
    return pixels;
  }

  private static ThumbMeasures measure(int[] pixels) {
    return ThumbMeasures.of(pixels, SIZE, SIZE);
  }

  public static void main(String[] args) {
    ThumbMeasures white = measure(filled(WHITE));
    check(white.mean == 255 && white.white == 1 && white.border == 1, "white page is white");
    check(white.ink == 0 && white.objectShare == 0, "white page has no ink and no object");
    check(white.edgeBox == 0 && white.edge == 0, "white page has no edges");
    check(white.colours == 1, "white page has one colour: " + white.colours);

    ThumbMeasures clear = measure(filled(0x00000000));
    check(clear.mean == 255 && clear.objectShare == 0, "a transparent picture is blank on white");

    ThumbMeasures black = measure(filled(BLACK));
    check(black.mean == 0 && black.dark == 1 && black.border == 0, "black page is dark");
    check(black.borderMedian == 0 && black.ink == 0, "ink is darker than the background only");

    ThumbMeasures midGray = measure(filled(gray(128)));
    check(midGray.mid == 1 && midGray.dark == 0 && midGray.white == 0, "mid gray is mid");

    ThumbMeasures lines = measure(outline(BLACK));
    check(lines.border == 1 && lines.borderMedian == 255, "outline sits on a white frame");
    check(lines.ink > 0.02 && lines.ink < 0.04, "outline ink share: " + lines.ink);
    check(lines.inkLeft == 30 && lines.inkTop == 30 && lines.inkWidth == 40
        && lines.inkHeight == 40, "ink box is the square");
    check(lines.thickness >= 1 && lines.thickness <= 2, "thin strokes: " + lines.thickness);
    check(lines.edge > 0, "outline has Sobel edges");
    check(lines.edgeBox > 0.1 && lines.edgeBox < 0.25, "edge box holds the square: " + lines.edgeBox);
    check(lines.bands == 1 && Math.abs(lines.lineAspect - 1) < 1e-9, "a square is one band");

    ThumbMeasures faint = measure(outline(gray(160)));
    check(faint.ink == lines.ink, "light-gray lines count as ink against white");

    int[] disk = filled(WHITE);
    rect(disk, 20, 20, 60, 60, BLACK);
    ThumbMeasures solid = measure(disk);
    check(solid.ink == 0.36 && solid.thickness > 10, "a solid fill is thick: " + solid.thickness);

    int[] text = filled(WHITE);
    for (int line = 0; line < 3; line++) {
      rect(text, 10, 30 + line * 12, 80, 5, BLACK);
    }
    ThumbMeasures writing = measure(text);
    check(writing.bands == 3, "three lines of writing are three bands: " + writing.bands);
    check(writing.lineAspect > 8, "lines of writing are wide: " + writing.lineAspect);

    int[] colours = filled(WHITE);
    for (int i = 0; i < colours.length; i++) {
      colours[i] = 0xFF000000 | (int) ((i * 2654435761L) & 0xFFFFFF);
    }
    ThumbMeasures busy = measure(colours);
    check(busy.colours > 1000, "noise has many colours: " + busy.colours);
    check(busy.edgeBox > 0.9, "noise spreads its edges over the picture: " + busy.edgeBox);

    boolean refused = false;
    try {
      ThumbMeasures.of(new int[3], 2, 2);
    } catch (IllegalArgumentException expected) {
      refused = true;
    }
    check(refused, "a pixel array shorter than the size is refused");

    if (failures > 0) {
      System.err.println(failures + " failed");
      System.exit(1);
    }
    System.out.println("ThumbMeasuresTest: all passed");
  }
}
