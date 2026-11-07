package com.ink2pic.files;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.util.Arrays;

/**
 * Whether a saved PNG is whole: a download cut off midway is written in place in shared storage
 * (#62) and leaves a partial file, which must not count as saved (#91). Plain Java, so JVM tests
 * run it.
 */
public final class PngTail {
  /** The IEND chunk every PNG ends with: length 0, type «IEND», its CRC. */
  static final byte[] IEND = {
    0, 0, 0, 0, 0x49, 0x45, 0x4E, 0x44, (byte) 0xAE, 0x42, 0x60, (byte) 0x82
  };
  /** The smallest whole PNG: signature, IHDR, one IDAT and IEND. */
  static final long MIN_BYTES = 67;

  private PngTail() {}

  /** True when `file` is at least `MIN_BYTES` long and ends with the IEND chunk. */
  public static boolean isComplete(File file) throws IOException {
    if (!file.isFile() || file.length() < MIN_BYTES) {
      return false;
    }
    byte[] tail = new byte[IEND.length];
    try (RandomAccessFile input = new RandomAccessFile(file, "r")) {
      input.seek(file.length() - tail.length);
      input.readFully(tail);
    }
    return Arrays.equals(tail, IEND);
  }
}
