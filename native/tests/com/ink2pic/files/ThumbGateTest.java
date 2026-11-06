package com.ink2pic.files;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/** JVM tests for ThumbGate (#46), run by `node scripts/native-build.cjs --test`. */
public final class ThumbGateTest {
  private static int failures = 0;

  private static void check(boolean condition, String name) {
    if (!condition) {
      failures++;
      System.err.println("FAIL " + name);
    }
  }

  public static void main(String[] args) throws Exception {
    ThumbGate gate = new ThumbGate();
    check(gate.awaitFree(0), "free at start");

    gate.begin();
    long start = System.currentTimeMillis();
    check(!gate.awaitFree(50), "a thumbnail waits while an insert runs");
    check(System.currentTimeMillis() - start >= 50, "the wait lasts its limit");

    // A waiting thumbnail starts as soon as the insert ends, well before its limit.
    AtomicBoolean freed = new AtomicBoolean(false);
    CountDownLatch done = new CountDownLatch(1);
    Thread thumb = new Thread(() -> {
      freed.set(gate.awaitFree(10000));
      done.countDown();
    });
    thumb.start();
    Thread.sleep(50);
    check(done.getCount() == 1, "still waiting before the insert ends");
    gate.end();
    check(done.await(2, TimeUnit.SECONDS), "released when the insert ends");
    check(freed.get(), "released as free");

    gate.begin();
    gate.begin();
    gate.end();
    check(!gate.awaitFree(10), "two inserts: waits until both end");
    gate.end();
    gate.end();
    check(gate.awaitFree(0), "an extra end never goes below zero");

    // The person's download holds the gate from its submit to its end (#46).
    ExecutorService worker = Executors.newSingleThreadExecutor();
    CountDownLatch release = new CountDownLatch(1);
    gate.holding(worker).execute(() -> {
      try {
        release.await();
      } catch (InterruptedException interrupted) {
        Thread.currentThread().interrupt();
      }
    });
    check(!gate.awaitFree(10), "held while the download runs");
    release.countDown();
    check(gate.awaitFree(2000), "free once the download ends");

    // A worker that refuses the job never leaves the gate held: thumbnails would wait 20 s each.
    worker.shutdown();
    boolean refused = false;
    try {
      gate.holding(worker).execute(() -> {});
    } catch (RejectedExecutionException expected) {
      refused = true;
    }
    check(refused, "the refusal reaches the caller");
    check(gate.awaitFree(0), "free after a refused job");

    if (failures > 0) {
      System.err.println(failures + " failed");
      System.exit(1);
    }
    System.out.println("ThumbGateTest: all passed");
  }
}
