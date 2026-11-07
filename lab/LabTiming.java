import com.ink2pic.files.Contour;
import com.ink2pic.files.Decolor;
import com.ink2pic.files.EinkPixels;
import com.ink2pic.files.PerceptualHash;
import com.ink2pic.files.ThumbMeasures;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.imageio.ImageIO;

/**
 * The device's pixel schedule for pages 1 and 2, timed on a desktop JVM (#101): per query, every
 * thumbnail is measured, the converted ones are converted, and the insert's preparation of the
 * first tile is asked for at the same moment, as when the person taps while thumbnails are still
 * prepared. It prints per query the time until every thumbnail is ready and the time the insert
 * took from its request.
 *
 * <p>{@code before}: one worker runs everything, and a converted thumbnail is decoded and measured
 * again from its file. {@code after}: the thumbnails run on {@link #THUMB_THREADS} threads, the
 * insert on its own, and a conversion measures the pixels it wrote. The pixel code is whatever
 * {@code native/src} is compiled with, so the darkening's own measure is the one of that version.
 *
 * <p>Input on stdin: one {@code <file>\t<contour|darken|none>} line per tile, a blank line after
 * each query. Output: one JSON line per query of the last round.
 */
public final class LabTiming {
  /** {@code Workers.thumbThreads(4)}, the device's pool; restated so the base code compiles. */
  private static final int THUMB_THREADS = 3;
  /** The thumbnails' measure and conversion width, as on the device. */
  private static final int THUMB_WIDTH = 400;
  /** {@code INSERT_WIDTH}, the medium size; a thumbnail is never scaled up to it. */
  private static final int INSERT_WIDTH = 640;
  private static final double NANOS_PER_MS = 1e6;

  private LabTiming() {}

  private static int[] decode(File file, int width, int[] size) throws Exception {
    BufferedImage read = ImageIO.read(file);
    if (read == null) {
      throw new IllegalArgumentException("not an image");
    }
    int[] target = EinkPixels.targetSize(read.getWidth(), read.getHeight(), width);
    BufferedImage out = new BufferedImage(target[0], target[1], BufferedImage.TYPE_INT_ARGB);
    Graphics2D g = out.createGraphics();
    g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
    g.drawImage(read, 0, 0, target[0], target[1], null);
    g.dispose();
    size[0] = target[0];
    size[1] = target[1];
    return out.getRGB(0, 0, target[0], target[1], null, 0, target[0]);
  }

  /** `measureThumb`: the measures and the perceptual hash. */
  private static void measure(int[] argb, int width, int height) {
    ThumbMeasures.of(argb, width, height);
    PerceptualHash.of(argb, width, height);
  }

  /** `prepareForEink(..., 'png', contour)`: the PNG written to `dest`; returns its pixels. */
  private static int[] prepare(File source, File dest, int width, boolean contour, int[] size)
      throws Exception {
    int[] argb = decode(source, width, size);
    Decolor.apply(argb, size[0], size[1]);
    if (contour) {
      Contour.apply(argb, size[0], size[1]);
    } else {
      EinkPixels.darken(argb, size[0], size[1]);
    }
    EinkPixels.toEink(argb, true);
    BufferedImage out = new BufferedImage(size[0], size[1], BufferedImage.TYPE_INT_RGB);
    out.setRGB(0, 0, size[0], size[1], argb, 0, size[0]);
    ByteArrayOutputStream encoded = new ByteArrayOutputStream();
    ImageIO.write(out, "png", encoded);
    Files.write(dest.toPath(), encoded.toByteArray());
    return argb;
  }

  /** One tile on the thumbnail lane: measure, then convert as `kind` says. */
  private static CompletableFuture<Void> tile(
      String file, String kind, boolean after, ExecutorService thumbs, File scratch) {
    File source = new File(file);
    return CompletableFuture.runAsync(() -> run(() -> {
      int[] size = new int[2];
      measure(decode(source, THUMB_WIDTH, size), size[0], size[1]);
    }), thumbs).thenCompose(done -> {
      if ("none".equals(kind)) {
        return CompletableFuture.completedFuture(null);
      }
      File dest = new File(scratch, source.getName() + "." + kind + ".png");
      boolean contour = "contour".equals(kind);
      CompletableFuture<int[]> converted = CompletableFuture.supplyAsync(() -> {
        int[] size = new int[2];
        int[] argb = call(() -> prepare(source, dest, THUMB_WIDTH, contour, size));
        if (after) {
          // The conversion's own measures (#101): no second decode.
          measure(argb, size[0], size[1]);
        }
        return argb;
      }, thumbs);
      if (after) {
        return converted.thenApply(argb -> null);
      }
      return converted.thenCompose(argb -> CompletableFuture.runAsync(() -> run(() -> {
        int[] size = new int[2];
        measure(decode(dest, THUMB_WIDTH, size), size[0], size[1]);
      }), thumbs));
    });
  }

  private interface Work {
    void run() throws Exception;
  }

  private interface Value<T> {
    T get() throws Exception;
  }

  private static void run(Work work) {
    call(() -> {
      work.run();
      return null;
    });
  }

  private static <T> T call(Value<T> value) {
    try {
      return value.get();
    } catch (Exception error) {
      throw new IllegalStateException(error.getClass().getSimpleName(), error);
    }
  }

  /** {thumbs ms, insert ms} of one query. */
  private static double[] query(List<String[]> tiles, boolean after, File scratch) {
    ExecutorService thumbs = Executors.newFixedThreadPool(after ? THUMB_THREADS : 1);
    ExecutorService insert = after ? Executors.newSingleThreadExecutor() : thumbs;
    try {
      long start = System.nanoTime();
      List<CompletableFuture<Void>> all = new ArrayList<>();
      for (String[] tile : tiles) {
        all.add(tile(tile[0], tile[1], after, thumbs, scratch));
      }
      String[] winner = tiles.get(0);
      long asked = System.nanoTime();
      CompletableFuture<Long> inserted = CompletableFuture.supplyAsync(() -> {
        int[] size = new int[2];
        call(() -> prepare(new File(winner[0]), new File(scratch, "insert.png"), INSERT_WIDTH,
            "contour".equals(winner[1]), size));
        return System.nanoTime();
      }, insert);
      CompletableFuture.allOf(all.toArray(new CompletableFuture[0])).join();
      long thumbsDone = System.nanoTime();
      long insertDone = inserted.join();
      return new double[] {
        (thumbsDone - start) / NANOS_PER_MS, (insertDone - asked) / NANOS_PER_MS
      };
    } finally {
      thumbs.shutdownNow();
      insert.shutdownNow();
    }
  }

  public static void main(String[] args) throws Exception {
    boolean after = "after".equals(args[0]);
    int rounds = Integer.parseInt(args[1]);
    File scratch = Files.createTempDirectory("lab-timing").toFile();
    List<List<String[]>> queries = new ArrayList<>();
    List<String[]> current = new ArrayList<>();
    BufferedReader in =
        new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    String line;
    while ((line = in.readLine()) != null) {
      if (line.isEmpty()) {
        if (!current.isEmpty()) {
          queries.add(current);
          current = new ArrayList<>();
        }
        continue;
      }
      current.add(line.split("\t"));
    }
    if (!current.isEmpty()) {
      queries.add(current);
    }
    try {
      for (int round = 1; round <= rounds; round++) {
        for (int q = 0; q < queries.size(); q++) {
          double[] ms = query(queries.get(q), after, scratch);
          if (round == rounds) {
            System.out.println("{\"query\":" + q + ",\"tiles\":" + queries.get(q).size()
                + ",\"thumbsMs\":" + Math.round(ms[0]) + ",\"insertMs\":" + Math.round(ms[1]) + "}");
          }
        }
      }
    } finally {
      for (File file : scratch.listFiles()) {
        file.delete();
      }
      scratch.delete();
    }
  }
}
