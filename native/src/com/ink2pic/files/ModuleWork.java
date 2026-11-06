package com.ink2pic.files;

import com.facebook.react.bridge.Promise;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;

/** What every Ink2Pic native module shares: its background worker and its atomic write. */
final class ModuleWork {
  static final int BUFFER = 16 * 1024;

  private ModuleWork() {}

  interface Job {
    Object run() throws Exception;
  }

  /**
   * Runs off the React Native thread and settles the promise with a code on any failure, a
   * worker that refuses the job too: an exception thrown here, on the React thread, would
   * destroy the plugin (brief section 10.5).
   */
  static void submit(Executor worker, Promise promise, Job job) {
    try {
      worker.execute(() -> {
        try {
          promise.resolve(job.run());
        } catch (SafePaths.Refused refused) {
          promise.reject(refused.code, refused.getMessage());
        } catch (Throwable error) {
          // Throwable, not Exception: an Error such as NoClassDefFoundError left the promise
          // unsettled and the plugin view waiting (build 0.1.0 (4), #11).
          promise.reject("IO", error.getClass().getName() + ": " + error.getMessage());
        }
      });
    } catch (RejectedExecutionException refused) {
      promise.reject("REJECTED", "the worker refused the job: " + refused.getMessage());
    }
  }

  /** Writes to `<target>.part`, then renames, so a failure never leaves half a file. */
  static long writeAtomically(File target, InputStream input) throws Exception {
    File parent = target.getParentFile();
    if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
      throw new IOException("cannot create folder " + parent);
    }
    File part = SafePaths.partFile(target);
    long total = 0;
    try (OutputStream output = new FileOutputStream(part)) {
      byte[] buffer = new byte[BUFFER];
      int read;
      while ((read = input.read(buffer)) != -1) {
        total += read;
        if (total > SafePaths.MAX_DOWNLOAD_BYTES) {
          throw new SafePaths.Refused("TOO_LARGE", "over " + SafePaths.MAX_DOWNLOAD_BYTES + " bytes");
        }
        output.write(buffer, 0, read);
      }
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
