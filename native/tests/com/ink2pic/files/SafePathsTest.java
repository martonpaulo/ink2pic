package com.ink2pic.files;

import java.io.File;

/** JVM tests for SafePaths, run by `node scripts/native-build.cjs --test`. */
public final class SafePathsTest {
  private static int failures = 0;

  private static void check(boolean condition, String name) {
    if (!condition) {
      failures++;
      System.err.println("FAIL " + name);
    }
  }


  private static String codeOfUrl(String url) {
    try {
      SafePaths.checkHttps(url);
      return "ok";
    } catch (SafePaths.Refused refused) {
      return refused.code;
    }
  }

  private static String codeOfPath(String path) {
    try {
      SafePaths.checkPath(path);
      return "ok";
    } catch (SafePaths.Refused refused) {
      return refused.code;
    }
  }

  public static void main(String[] args) {
    check(codeOfUrl("https://openclipart.org/image/400px/1").equals("ok"), "https accepted");
    check(codeOfUrl("HTTPS://openclipart.org/").equals("ok"), "scheme case ignored");
    check(codeOfUrl("http://openclipart.org/").equals("HTTPS_ONLY"), "http refused");
    check(codeOfUrl("file:///etc/passwd").equals("HTTPS_ONLY"), "file refused");
    check(codeOfUrl(null).equals("HTTPS_ONLY"), "null url refused");
    check(codeOfPath("/storage/emulated/0/MyStyle/Ink2Pic/library/a.png").equals("ok"), "absolute path");
    check(codeOfPath("MyStyle/a.png").equals("BAD_PATH"), "relative refused");
    check(codeOfPath("/storage/../etc/a").equals("BAD_PATH"), "dot-dot refused");
    check(codeOfPath("/storage/./a").equals("BAD_PATH"), "dot refused");
    check(codeOfPath("/storage//a").equals("BAD_PATH"), "empty segment refused");
    check(codeOfPath("/storage/folder/").equals("BAD_PATH"), "folder refused");
    check(codeOfPath(null).equals("BAD_PATH"), "null path refused");
    check(SafePaths.partFile(new File("/a/b.png")).getPath().equals("/a/b.png.part"), "part file");
    check(SafePaths.MAX_DOWNLOAD_BYTES == 20L * 1024 * 1024, "size cap");
    if (failures > 0) {
      System.err.println(failures + " failed");
      System.exit(1);
    }
    System.out.println("SafePathsTest: all passed");
  }
}
