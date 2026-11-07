package com.ink2pic.files;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableMapKeySetIterator;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;

/**
 * Downloads and small text files for Ink2Pic: sn-plugin-lib 0.2.3 and PluginHost have no file
 * writer (brief sections 4.2 and 6, issue #11). The host enforces the plugin's file permissions.
 *
 * Three workers, so the person's work never queues behind background work (#46): small file
 * work (text files, listings, the log) on one thread, the person's download (the insert) on
 * another, and grid thumbnails on a small pool that yields to the person's download.
 */
public final class Ink2PicFilesModule extends ReactContextBaseJavaModule {
  private static final int TIMEOUT_MS = 15000;
  /** DEFAULT: a page has six thumbnails; three at a time keeps the radio and the CPU light. */
  private static final int THUMB_THREADS = 3;
  /** A thumbnail waits at most this long for an insert, the insert's own limit (20 s). */
  private static final long THUMB_WAIT_MS = 20000;
  private final Workers workers = new Workers();
  private final ExecutorService files = workers.single();
  private final ExecutorService downloads = workers.single();
  private final ExecutorService thumbs = workers.pool(THUMB_THREADS);
  private final ThumbGate gate = new ThumbGate();
  /** The person's downloads, holding the gate from submit to end, also when refused (#46). */
  private final java.util.concurrent.Executor heldDownloads = gate.holding(downloads);

  public Ink2PicFilesModule(ReactApplicationContext context) {
    super(context);
  }

  @Override
  public String getName() {
    return "Ink2PicFiles";
  }

  /** A new React instance makes a new module: this one's threads stop with it (#95). */
  @Override
  public void invalidate() {
    workers.shutdown();
    super.invalidate();
  }

  private void submit(Promise promise, ModuleWork.Job job) {
    ModuleWork.submit(files, promise, job);
  }

  /** The person's download: thumbnails wait to start until it ends. */
  @ReactMethod
  public void downloadToFile(String url, String destPath, ReadableMap headers, Promise promise) {
    ModuleWork.submit(heldDownloads, promise, () -> download(url, destPath, headers));
  }

  /** A grid thumbnail, in the background: it starts only when no insert download runs. */
  @ReactMethod
  public void downloadThumbToFile(
      String url, String destPath, ReadableMap headers, Promise promise) {
    ModuleWork.submit(thumbs, promise, () -> {
      gate.awaitFree(THUMB_WAIT_MS);
      return download(url, destPath, headers);
    });
  }

  private static Object download(String url, String destPath, ReadableMap headers)
      throws Exception {
    SafePaths.checkHttps(url);
    File target = SafePaths.checkPath(destPath);
    HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
    connection.setConnectTimeout(TIMEOUT_MS);
    connection.setReadTimeout(TIMEOUT_MS);
    if (headers != null) {
      ReadableMapKeySetIterator keys = headers.keySetIterator();
      while (keys.hasNextKey()) {
        String key = keys.nextKey();
        connection.setRequestProperty(key, headers.getString(key));
      }
    }
    try {
      int status = connection.getResponseCode();
      if (status < 200 || status > 299) {
        throw new SafePaths.Refused("HTTP_" + status, "HTTP " + status + " for " + url);
      }
      try (InputStream input = connection.getInputStream()) {
        return (double) FileWrites.writeAtomically(target, input);
      }
    } finally {
      connection.disconnect();
    }
  }

  /** Resolves true when the file is gone afterwards, also when it never existed. */
  @ReactMethod
  public void deleteFile(String path, Promise promise) {
    submit(promise, () -> {
      File target = SafePaths.checkPath(path);
      return !target.exists() || target.delete();
    });
  }

  @ReactMethod
  public void writeText(String path, String text, Promise promise) {
    submit(promise, () -> {
      File target = SafePaths.checkPath(path);
      byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
      FileWrites.writeAtomically(target, new java.io.ByteArrayInputStream(bytes));
      return null;
    });
  }

  /**
   * Adds the text at the end of the file, creating it when missing: the session log appends its
   * new lines instead of rewriting the whole file after every call (#102). In place, like every
   * shared write, so PluginHost needs FILE:WRITE only (#62).
   */
  @ReactMethod
  public void appendText(String path, String text, Promise promise) {
    submit(promise, () -> {
      File target = SafePaths.checkPath(path);
      FileWrites.append(target, text.getBytes(StandardCharsets.UTF_8));
      return null;
    });
  }

  /**
   * The names in a folder, oldest modified first, or null when it does not exist. Replaces FileUtils.listFiles and exists:
   * a SecurityException there escapes the TurboModule and the host closes the plugin
   * (j-raghavan/sn-dictionary [REPORTED]; build 0.1.0 (9) closed at once, #13). Errors here reject.
   */
  @ReactMethod
  public void listDir(String path, Promise promise) {
    submit(promise, () -> {
      File folder = new File(SafePaths.checkPath(path).getPath());
      File[] entries = folder.isDirectory() ? folder.listFiles() : null;
      if (entries == null) {
        return null;
      }
      // Oldest first, so the thumbnail store removes the oldest file first (#46).
      java.util.Arrays.sort(entries, (a, b) -> Long.compare(a.lastModified(), b.lastModified()));
      com.facebook.react.bridge.WritableArray array = com.facebook.react.bridge.Arguments.createArray();
      for (File entry : entries) {
        array.pushString(entry.getName());
      }
      return array;
    });
  }

  /**
   * The `.png` files of a folder that are whole (they end with the IEND chunk), or null when the
   * folder does not exist: a download cut off midway is never counted as saved (#91). It opens
   * every file, so only Settings calls it; the search lists with listSizes (#102).
   */
  @ReactMethod
  public void listCompletePngs(String path, Promise promise) {
    submit(promise, () -> {
      File folder = new File(SafePaths.checkPath(path).getPath());
      File[] entries = folder.isDirectory() ? folder.listFiles() : null;
      if (entries == null) {
        return null;
      }
      com.facebook.react.bridge.WritableArray array = com.facebook.react.bridge.Arguments.createArray();
      for (File entry : entries) {
        if (entry.getName().endsWith(".png") && PngTail.isComplete(entry)) {
          array.pushString(entry.getName());
        }
      }
      return array;
    });
  }

  /**
   * The files of a folder with their sizes, or null when the folder does not exist. No file is
   * opened: the symbols folder holds 1,447 files, and each one's PNG end is checked only when it
   * is about to be used (#91, #102).
   */
  @ReactMethod
  public void listSizes(String path, Promise promise) {
    submit(promise, () -> {
      File folder = new File(SafePaths.checkPath(path).getPath());
      File[] entries = folder.isDirectory() ? folder.listFiles() : null;
      if (entries == null) {
        return null;
      }
      com.facebook.react.bridge.WritableArray array = com.facebook.react.bridge.Arguments.createArray();
      for (File entry : entries) {
        com.facebook.react.bridge.WritableMap item = com.facebook.react.bridge.Arguments.createMap();
        item.putString("name", entry.getName());
        item.putDouble("bytes", (double) entry.length());
        array.pushMap(item);
      }
      return array;
    });
  }

  /** True when the file is a whole PNG (#91). */
  @ReactMethod
  public void isCompletePng(String path, Promise promise) {
    submit(promise, () -> PngTail.isComplete(SafePaths.checkPath(path)));
  }

  /** Resolves null when the file does not exist. */
  @ReactMethod
  public void readText(String path, Promise promise) {
    submit(promise, () -> {
      File target = SafePaths.checkPath(path);
      if (!target.isFile()) {
        return null;
      }
      try (InputStream input = new FileInputStream(target)) {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[FileWrites.BUFFER];
        int read;
        while ((read = input.read(buffer)) != -1) {
          output.write(buffer, 0, read);
        }
        return new String(output.toByteArray(), StandardCharsets.UTF_8);
      }
    });
  }
}
