package com.ink2pic.files;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.concurrent.ConcurrentHashMap;

/**
 * How every Ink2Pic native module writes a file. Plain Java, so the JVM tests run it (#111): the
 * image module has two or three threads since #101, and two of them may write one path at once.
 */
final class FileWrites {
  static final int BUFFER = 16 * 1024;

  /**
   * One lock per canonical destination (#111): two writes to one file take turns, so they never
   * share its `.part` file. shortcut: the map keeps one small object per path written in the
   * session, a few hundred at most; upgrade to weak references if a session writes many thousands.
   */
  private static final ConcurrentHashMap<String, Object> LOCKS = new ConcurrentHashMap<>();

  private FileWrites() {}

  private static Object lockFor(File target) throws IOException {
    return LOCKS.computeIfAbsent(target.getCanonicalPath(), path -> new Object());
  }

  /**
   * Writes to `<target>.part`, then renames, so a failure never leaves half a file; one writer at
   * a time per destination (#111).
   */
  static long writeAtomically(File target, InputStream input) throws Exception {
    File parent = target.getParentFile();
    if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
      throw new IOException("cannot create folder " + parent);
    }
    synchronized (lockFor(target)) {
      if (SafePaths.isShared(target)) {
        return writeInPlace(target, input);
      }
      File part = SafePaths.partFile(target);
      long total;
      try (OutputStream output = new FileOutputStream(part)) {
        total = copy(input, output);
      } catch (Exception error) {
        part.delete();
        throw error;
      }
      if (target.exists() && !target.delete()) {
        part.delete();
        throw new IOException("cannot replace " + target);
      }
      if (!part.renameTo(target)) {
        part.delete();
        throw new IOException("cannot rename " + part + " to " + target);
      }
      return total;
    }
  }

  /** Adds `bytes` at the end of `target`, creating it and its folder when missing (#102). */
  static void append(File target, byte[] bytes) throws IOException {
    File parent = target.getParentFile();
    if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
      throw new IOException("cannot create folder " + parent);
    }
    try (OutputStream output = new FileOutputStream(target, true)) {
      output.write(bytes);
    }
  }

  /**
   * Writes straight into a file in shared storage: no temporary file, no rename, no delete, which
   * PluginHost refuses without FILE:DELETE (#62). shortcut: a write cut off midway leaves a partial
   * file, which the next write replaces; upgrade if a device shows such a file.
   */
  private static long writeInPlace(File target, InputStream input) throws Exception {
    try (OutputStream output = new FileOutputStream(target, false)) {
      return copy(input, output);
    }
  }

  private static long copy(InputStream input, OutputStream output) throws Exception {
    long total = 0;
    byte[] buffer = new byte[BUFFER];
    int read;
    while ((read = input.read(buffer)) != -1) {
      total += read;
      if (total > SafePaths.MAX_DOWNLOAD_BYTES) {
        throw new SafePaths.Refused("TOO_LARGE", "over " + SafePaths.MAX_DOWNLOAD_BYTES + " bytes");
      }
      output.write(buffer, 0, read);
    }
    return total;
  }
}
