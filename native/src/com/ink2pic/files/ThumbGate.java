package com.ink2pic.files;

/**
 * Lets the person's download go first (#46): a thumbnail download waits to start while an insert
 * download runs, at most a bounded time, so a page of thumbnails never pushes the insert past its
 * limit. Thumbnail downloads already running finish; only new ones wait.
 */
final class ThumbGate {
  private int active = 0;

  /** The person's download is queued or running. Never throws: it runs on the React thread. */
  synchronized void begin() {
    active++;
  }

  synchronized void end() {
    if (active > 0) {
      active--;
    }
    if (active == 0) {
      notifyAll();
    }
  }

  /**
   * Waits until no person's download runs, at most `maxWaitMs`; true when the gate is free.
   * An interrupt ends the wait early and keeps the thread's interrupt flag.
   */
  synchronized boolean awaitFree(long maxWaitMs) {
    long deadline = System.currentTimeMillis() + maxWaitMs;
    while (active > 0) {
      long left = deadline - System.currentTimeMillis();
      if (left <= 0) {
        return false;
      }
      try {
        wait(left);
      } catch (InterruptedException interrupted) {
        Thread.currentThread().interrupt();
        return false;
      }
    }
    return true;
  }
}
