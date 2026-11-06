package com.ink2pic.files;

import java.io.File;

/** Rules for every URL and path the module touches. Plain Java, so JVM tests run it. */
public final class SafePaths {
  /** Downloads stop above this size: a grid picture is about 50 to 150 KB (brief section 7). */
  public static final long MAX_DOWNLOAD_BYTES = 20L * 1024 * 1024;

  private SafePaths() {}

  /** Thrown with a stable code the JavaScript side reads. */
  public static final class Refused extends Exception {
    public final String code;

    public Refused(String code, String message) {
      super(message);
      this.code = code;
    }
  }

  /** PluginHost blocks cleartext HTTP (brief section 3.7), so only HTTPS is accepted. */
  public static void checkHttps(String url) throws Refused {
    if (url == null || !url.toLowerCase(java.util.Locale.ROOT).startsWith("https://")) {
      throw new Refused("HTTPS_ONLY", "only https:// URLs are allowed: " + url);
    }
  }

  /** An absolute path with no empty, "." or ".." segment. */
  public static File checkPath(String path) throws Refused {
    if (path == null || !path.startsWith("/") || path.endsWith("/")) {
      throw new Refused("BAD_PATH", "an absolute file path is required: " + path);
    }
    for (String segment : path.substring(1).split("/", -1)) {
      if (segment.isEmpty() || segment.equals(".") || segment.equals("..")) {
        throw new Refused("BAD_PATH", "the path has an empty, . or .. segment: " + path);
      }
    }
    return new File(path);
  }

  /** The temporary file a write goes to before it is renamed into place. */
  public static File partFile(File target) {
    return new File(target.getParentFile(), target.getName() + ".part");
  }
}
