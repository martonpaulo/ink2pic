package com.ink2pic.files;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The Java side of the rules both languages hold (#100), against `native/tests/twins.json`, which
 * `__tests__/twins.test.ts` reads too. Run by `node scripts/native-build.cjs --test` from the
 * repository root.
 */
public final class TwinsTest {
  private static final String GOLDEN = "native/tests/twins.json";
  private static int failures = 0;

  private static void check(boolean condition, String name) {
    if (!condition) {
      failures++;
      System.err.println("FAIL " + name);
    }
  }

  private static String value(String json, String key) {
    Matcher m = Pattern.compile("\"" + key + "\":\\s*([0-9.]+)").matcher(json);
    return m.find() ? m.group(1) : "";
  }

  private static List<String> list(String json, String key) {
    Matcher m = Pattern.compile("\"" + key + "\":\\s*\\[([^\\]]*)\\]").matcher(json);
    List<String> names = new ArrayList<>();
    if (m.find()) {
      Matcher name = Pattern.compile("\"(\\w+)\"").matcher(m.group(1));
      while (name.find()) {
        names.add(name.group(1));
      }
    }
    return names;
  }

  public static void main(String[] args) throws Exception {
    String json = new String(Files.readAllBytes(Paths.get(GOLDEN)), StandardCharsets.UTF_8);
    check(
        EinkPixels.CLEAN_BORDER == Double.parseDouble(value(json, "cleanBorder")),
        "CLEAN_BORDER is the golden's cleanBorder");
    check(
        EinkPixels.MEASURE_WIDTH == Integer.parseInt(value(json, "measureWidth")),
        "MEASURE_WIDTH is the golden's measureWidth");

    // ThumbMeasures' fields are the golden's Measures without what the module adds; sorted, since
    // reflection does not promise the declaration order.
    List<String> expected = list(json, "measures");
    expected.removeAll(list(json, "notFields"));
    List<String> fields = new ArrayList<>();
    for (Field field : ThumbMeasures.class.getDeclaredFields()) {
      int modifiers = field.getModifiers();
      if (Modifier.isPublic(modifiers) && !Modifier.isStatic(modifiers)) {
        fields.add(field.getName());
      }
    }
    check(!expected.isEmpty(), "the golden lists the Measures");
    Collections.sort(expected);
    Collections.sort(fields);
    check(fields.equals(expected), "ThumbMeasures fields " + fields + " are the golden's " + expected);

    if (failures > 0) {
      System.err.println(failures + " failed");
      System.exit(1);
    }
    System.out.println("TwinsTest: all passed");
  }
}
