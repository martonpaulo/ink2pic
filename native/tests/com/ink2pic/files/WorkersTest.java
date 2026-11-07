package com.ink2pic.files;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/** JVM tests for Workers (#95), run by `node scripts/native-build.cjs --test`. */
public final class WorkersTest {
  private static int failures = 0;

  private static void check(boolean condition, String name) {
    if (!condition) {
      failures++;
      System.err.println("FAIL " + name);
    }
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

    if (failures > 0) {
      System.err.println(failures + " failed");
      System.exit(1);
    }
    System.out.println("WorkersTest: all passed");
  }
}
