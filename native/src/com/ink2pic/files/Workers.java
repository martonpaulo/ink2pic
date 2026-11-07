package com.ink2pic.files;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * A native module's worker threads, made here so they all stop together: React Native makes new
 * modules for each new React instance and calls `invalidate()` on the old ones, whose threads
 * otherwise kept running (#95).
 */
final class Workers {
  /** At least two thumbnail threads, so one long contour does not hold the others back (#101). */
  static final int MIN_THUMB_THREADS = 2;
  /**
   * At most three: the device has 4 cores, and the insert and the UI need one. A contour drawing
   * needs about 21 bytes per pixel, 3.4 MB for a 400 x 400 px thumbnail, so three at once hold
   * about 10 MB beside the insert's own.
   */
  static final int MAX_THUMB_THREADS = 3;

  private final List<ExecutorService> all = new ArrayList<>();

  /** The image module's thumbnail pool for `processors` cores: one left free, within bounds. */
  static int thumbThreads(int processors) {
    return Math.max(MIN_THUMB_THREADS, Math.min(MAX_THUMB_THREADS, processors - 1));
  }

  synchronized ExecutorService single() {
    return keep(Executors.newSingleThreadExecutor());
  }

  synchronized ExecutorService pool(int threads) {
    return keep(Executors.newFixedThreadPool(threads));
  }

  /**
   * Stops every worker: queued jobs are dropped and running ones interrupted, since the React
   * instance that waits for their promises is gone. Never throws: it runs on the React thread.
   */
  synchronized void shutdown() {
    for (ExecutorService worker : all) {
      worker.shutdownNow();
    }
  }

  private ExecutorService keep(ExecutorService worker) {
    all.add(worker);
    return worker;
  }
}
