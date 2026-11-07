package com.ink2pic.files;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/** JVM tests for Workers (#95), run by `node scripts/native-build.cjs --test`. */
public final class WorkersTest {
  private static int failures = 0;

  private static void check(boolean condition, String name) {
    if (!condition) {
      failures++;
      System.err.println("FAIL " + name);
    }
  }

  /**
   * The image module's two lanes (#101): every thumbnail thread busy and more queued, the insert
   * on its own thread still runs at once; the pool runs at most its threads side by side.
   */
  private static void lanes() throws Exception {
    check(Workers.thumbThreads(1) == 2, "at least two thumbnail threads");
    check(Workers.thumbThreads(4) == 3, "three on the device's 4 cores");
    check(Workers.thumbThreads(16) == 3, "at most three");
    Workers workers = new Workers();
    ExecutorService thumbs = workers.pool(Workers.thumbThreads(4));
    ExecutorService insert = workers.single();
    CountDownLatch release = new CountDownLatch(1);
    CountDownLatch running = new CountDownLatch(Workers.MAX_THUMB_THREADS);
    AtomicInteger together = new AtomicInteger();
    AtomicInteger most = new AtomicInteger();
    for (int i = 0; i < Workers.MAX_THUMB_THREADS * 4; i++) {
      thumbs.execute(() -> {
        most.accumulateAndGet(together.incrementAndGet(), Math::max);
        running.countDown();
        try {
          release.await();
        } catch (InterruptedException stopped) {
          Thread.currentThread().interrupt();
        }
        together.decrementAndGet();
      });
    }
    check(running.await(5, TimeUnit.SECONDS), "the thumbnail jobs run side by side");
    CountDownLatch inserted = new CountDownLatch(1);
    insert.execute(inserted::countDown);
    check(inserted.await(5, TimeUnit.SECONDS),
        "the insert runs while every thumbnail thread is busy");
    check(most.get() == Workers.MAX_THUMB_THREADS,
        "at most the pool's threads run at once: " + most.get());
    release.countDown();
    workers.shutdown();
    check(thumbs.awaitTermination(5, TimeUnit.SECONDS)
            && insert.awaitTermination(5, TimeUnit.SECONDS),
        "invalidate's shutdown stops both lanes");
    boolean refused = false;
    try {
      insert.execute(() -> {});
    } catch (RejectedExecutionException expected) {
      refused = true;
    }
    check(refused, "a lane refuses work after shutdown, which ModuleWork rejects with a code");
  }

  public static void main(String[] args) throws Exception {
    Workers workers = new Workers();
    ExecutorService single = workers.single();
    ExecutorService pool = workers.pool(3);
    CountDownLatch started = new CountDownLatch(1);
    AtomicBoolean interrupted = new AtomicBoolean(false);
    single.execute(() -> {
      started.countDown();
      try {
        Thread.sleep(60000);
      } catch (InterruptedException stop) {
        interrupted.set(true);
      }
    });
    check(started.await(5, TimeUnit.SECONDS), "the job started");
    check(!single.isShutdown() && !pool.isShutdown(), "running before shutdown");

    workers.shutdown();
    check(single.isShutdown() && pool.isShutdown(), "every worker is shut down");
    check(single.awaitTermination(5, TimeUnit.SECONDS), "the running job's thread ends");
    check(pool.awaitTermination(5, TimeUnit.SECONDS), "the idle pool's threads end");
    check(interrupted.get(), "the running job is interrupted");

    lanes();
    if (failures > 0) {
      System.err.println(failures + " failed");
      System.exit(1);
    }
    System.out.println("WorkersTest: all passed");
  }
}
