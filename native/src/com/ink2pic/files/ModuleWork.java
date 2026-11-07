package com.ink2pic.files;

import com.facebook.react.bridge.Promise;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;

/** What every Ink2Pic native module shares: its background worker; writes are in FileWrites. */
final class ModuleWork {
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
}
