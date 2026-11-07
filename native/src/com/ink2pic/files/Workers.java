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
  private final List<ExecutorService> all = new ArrayList<>();

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
