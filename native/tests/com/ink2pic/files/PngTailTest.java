package com.ink2pic.files;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

/** JVM tests for PngTail, run by `node scripts/native-build.cjs --test` (#91). */
public final class PngTailTest {
  private static int failures = 0;

  private static void check(boolean condition, String name) {
    if (!condition) {
      failures++;
      System.err.println("FAIL " + name);
    }
  }

  private static File write(byte[] bytes) throws IOException {
    File file = File.createTempFile("ink2pic-png", ".png");
    file.deleteOnExit();
    try (FileOutputStream output = new FileOutputStream(file)) {
      output.write(bytes);
    }
    return file;
  }

  /** `size` bytes of a PNG body, ending with IEND when `whole`. */
  private static byte[] png(int size, boolean whole) {
    byte[] bytes = new byte[size];
    bytes[1] = 0x50;
    if (whole) {
      System.arraycopy(PngTail.IEND, 0, bytes, size - PngTail.IEND.length, PngTail.IEND.length);
    }
    return bytes;
  }

  public static void main(String[] args) throws IOException {
    check(PngTail.isComplete(write(png(10400, true))), "a whole PNG is complete");
    byte[] whole = png(10400, true);
    check(!PngTail.isComplete(write(java.util.Arrays.copyOf(whole, 6000))), "a cut-off PNG is not");
    check(!PngTail.isComplete(write(new byte[0])), "an empty file is not");
    check(!PngTail.isComplete(write(PngTail.IEND)), "IEND alone is too small");
    check(!PngTail.isComplete(new File("/nonexistent/ink2pic.png")), "a missing file is not");
    if (failures > 0) {
      System.err.println(failures + " failed");
      System.exit(1);
    }
    System.out.println("PngTailTest: all passed");
  }
}
