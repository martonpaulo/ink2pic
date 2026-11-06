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
import java.util.concurrent.Executors;

/**
 * Downloads and small text files for Ink2Pic: sn-plugin-lib 0.2.3 and PluginHost have no file
 * writer (brief sections 4.2 and 6, issue #11). The host enforces the plugin's file permissions.
 */
public final class Ink2PicFilesModule extends ReactContextBaseJavaModule {
  private static final int TIMEOUT_MS = 15000;
  private final ExecutorService worker = Executors.newSingleThreadExecutor();

  public Ink2PicFilesModule(ReactApplicationContext context) {
    super(context);
  }

  @Override
  public String getName() {
    return "Ink2PicFiles";
  }

  private void submit(Promise promise, ModuleWork.Job job) {
    ModuleWork.submit(worker, promise, job);
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
          return (double) ModuleWork.writeAtomically(target, input);
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
      ModuleWork.writeAtomically(target, new java.io.ByteArrayInputStream(bytes));
      return null;
    });
  }

  /** Resolves null when the file does not exist. */
  /**
   * The names in a folder, or null when it does not exist. Replaces FileUtils.listFiles and exists:
   * a SecurityException there escapes the TurboModule and the host closes the plugin
   * (j-raghavan/sn-dictionary [REPORTED]; build 0.1.0 (9) closed at once, #13). Errors here reject.
   */
  @ReactMethod
  public void listDir(String path, Promise promise) {
    submit(promise, () -> {
      File folder = new File(SafePaths.checkPath(path).getPath());
      String[] names = folder.isDirectory() ? folder.list() : null;
      if (names == null) {
        return null;
      }
      com.facebook.react.bridge.WritableArray array = com.facebook.react.bridge.Arguments.createArray();
      for (String name : names) {
        array.pushString(name);
      }
      return array;
    });
  }

  @ReactMethod
  public void readText(String path, Promise promise) {
    submit(promise, () -> {
      File target = SafePaths.checkPath(path);
      if (!target.isFile()) {
        return null;
      }
      try (InputStream input = new FileInputStream(target)) {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[ModuleWork.BUFFER];
        int read;
        while ((read = input.read(buffer)) != -1) {
          output.write(buffer, 0, read);
        }
        return new String(output.toByteArray(), StandardCharsets.UTF_8);
      }
    });
  }
}
