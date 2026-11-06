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
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Downloads and small text files for Ink2Pic: sn-plugin-lib 0.2.3 and PluginHost have no file
 * writer (brief sections 4.2 and 6, issue #11). The host enforces the plugin's file permissions.
 */
public final class Ink2PicFilesModule extends ReactContextBaseJavaModule {
  private static final int TIMEOUT_MS = 15000;
  private static final int BUFFER = 16 * 1024;
  private final ExecutorService worker = Executors.newSingleThreadExecutor();

  public Ink2PicFilesModule(ReactApplicationContext context) {
    super(context);
  }

  @Override
  public String getName() {
    return "Ink2PicFiles";
  }

  private interface Job {
    Object run() throws Exception;
  }

  /** Runs off the React Native thread and settles the promise with a code on any failure. */
  private void submit(Promise promise, Job job) {
    worker.execute(() -> {
      try {
        promise.resolve(job.run());
      } catch (SafePaths.Refused refused) {
        promise.reject(refused.code, refused.getMessage());
      } catch (Exception error) {
        promise.reject("IO", error.getClass().getSimpleName() + ": " + error.getMessage());
      }
    });
  }

  /** Writes to `<target>.part`, then renames, so a failure never leaves half a file. */
  private static long writeAtomically(File target, InputStream input) throws Exception {
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

  @ReactMethod
  public void downloadToFile(String url, String destPath, ReadableMap headers, Promise promise) {
    submit(promise, () -> {
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
          return (double) writeAtomically(target, input);
        }
      } finally {
        connection.disconnect();
      }
    });
  }

  @ReactMethod
  public void writeText(String path, String text, Promise promise) {
    submit(promise, () -> {
      File target = SafePaths.checkPath(path);
      byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
      writeAtomically(target, new java.io.ByteArrayInputStream(bytes));
      return null;
    });
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
        byte[] buffer = new byte[BUFFER];
        int read;
        while ((read = input.read(buffer)) != -1) {
          output.write(buffer, 0, read);
        }
        return new String(output.toByteArray(), StandardCharsets.UTF_8);
      }
    });
  }
}
