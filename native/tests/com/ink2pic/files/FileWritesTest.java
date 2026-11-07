package com.ink2pic.files;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** JVM tests for FileWrites (#111), run by `node scripts/native-build.cjs --test`. */
public final class FileWritesTest {
  private static int failures = 0;
  /** How long a writer waits, halfway, for the other one to start writing too. */
  private static final long OVERLAP_MS = 300;
  private static final int SIZE = 64 * 1024;

  private static void check(boolean condition, String name) {
    if (!condition) {
      failures++;
      System.err.println("FAIL " + name);
    }
  }

  /**
   * Gives `bytes` in small reads; after the first read it marks `started` and waits for `other`,
   * so two unguarded writers would both be inside the one `.part` file at once.
   */
  private static InputStream slow(byte[] bytes, CountDownLatch started, CountDownLatch other) {
    return new InputStream() {
      private int at = 0;

      @Override
      public int read() {
        throw new UnsupportedOperationException();
      }

      @Override
      public int read(byte[] buffer, int offset, int length) throws IOException {
        if (at >= bytes.length) {
          return -1;
        }
        if (at > 0 && started.getCount() > 0) {
          started.countDown();
          try {
            other.await(OVERLAP_MS, TimeUnit.MILLISECONDS);
          } catch (InterruptedException stopped) {
            Thread.currentThread().interrupt();
          }
        }
        int count = Math.min(Math.min(length, 1024), bytes.length - at);
        System.arraycopy(bytes, at, buffer, offset, count);
        at += count;
        return count;
      }
    };
  }

  private static byte[] filled(int value) {
    byte[] bytes = new byte[SIZE];
    Arrays.fill(bytes, (byte) value);
    return bytes;
  }

  /**
   * Two thumbnail conversions to one path at once (#111): both writes succeed and the file holds
   * one of them whole, never a mix, with no `.part` file left.
   */
  private static void twoWritersOnePath() throws Exception {
    File folder = Files.createTempDirectory("ink2pic-file-writes-").toFile();
    File target = new File(folder, "openclipart-1.png");
    byte[] first = filled(1);
    byte[] second = filled(2);
    CountDownLatch firstStarted = new CountDownLatch(1);
    CountDownLatch secondStarted = new CountDownLatch(1);
    AtomicReference<Throwable> firstError = new AtomicReference<>();
    AtomicReference<Throwable> secondError = new AtomicReference<>();
    Thread a = new Thread(() -> {
      try {
        FileWrites.writeAtomically(target, slow(first, firstStarted, secondStarted));
      } catch (Throwable error) {
        firstError.set(error);
      }
    });
    Thread b = new Thread(() -> {
      try {
        FileWrites.writeAtomically(target, slow(second, secondStarted, firstStarted));
      } catch (Throwable error) {
        secondError.set(error);
      }
    });
    a.start();
    b.start();
    a.join(10_000);
    b.join(10_000);
    check(firstError.get() == null, "the first write succeeds: " + firstError.get());
    check(secondError.get() == null, "the second write succeeds: " + secondError.get());
    byte[] written = Files.readAllBytes(target.toPath());
    check(Arrays.equals(written, first) || Arrays.equals(written, second),
        "the file is one write whole: " + written.length + " bytes");
    check(!SafePaths.partFile(target).exists(), "no .part file is left");
    target.delete();
    folder.delete();
  }

  public static void main(String[] args) throws Exception {
    twoWritersOnePath();
    if (failures > 0) {
      System.err.println(failures + " failed");
      System.exit(1);
    }
    System.out.println("FileWritesTest: all passed");
  }
}
