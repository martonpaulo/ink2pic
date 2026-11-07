import com.ink2pic.files.Contour;
import com.ink2pic.files.Decolor;
import com.ink2pic.files.EinkPixels;
import com.ink2pic.files.PerceptualHash;
import com.ink2pic.files.ThumbMeasures;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.nio.charset.StandardCharsets;
import javax.imageio.ImageIO;

/**
 * The device's pixel measures and contour drawing for the search lab (#81): the plugin's own
 * {@code ThumbMeasures}, {@code Contour} and {@code EinkPixels}, compiled from {@code native/src},
 * with the picture decoded by ImageIO in place of Android's BitmapFactory.
 *
 * <p>Reads one thumbnail file per line on stdin and prints one JSON line per file: the measures of
 * the thumbnail, the measures of its contour drawing and that drawing's file, written once beside
 * the thumbnail as {@code <file>.<version>.contour.png}, as the device writes it; the version,
 * the first argument, names the Java that made it. An unreadable file gets an {@code error}.
 */
public final class LabPixels {
  /** `MEASURE_WIDTH` and `CONTOUR_THUMB_WIDTH` of the device: thumbnails are never scaled up. */
  private static final int WIDTH = 400;

  private LabPixels() {}

  /** The picture's unpremultiplied ARGB pixels, scaled down to `WIDTH` (never up). */
  private static BufferedImage decode(File file) throws Exception {
    BufferedImage read = ImageIO.read(file);
    if (read == null) {
      throw new IllegalArgumentException("not an image");
    }
    int[] size = EinkPixels.targetSize(read.getWidth(), read.getHeight(), WIDTH);
    BufferedImage out = new BufferedImage(size[0], size[1], BufferedImage.TYPE_INT_ARGB);
    Graphics2D g = out.createGraphics();
    g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
    g.drawImage(read, 0, 0, size[0], size[1], null);
    g.dispose();
    return out;
  }

  private static int[] pixels(BufferedImage image) {
    return image.getRGB(0, 0, image.getWidth(), image.getHeight(), null, 0, image.getWidth());
  }

  /** Every public measure field, by name, as the device's `measureThumb` resolves them. */
  private static String json(ThumbMeasures m) throws IllegalAccessException {
    StringBuilder out = new StringBuilder("{");
    for (Field field : ThumbMeasures.class.getFields()) {
      if (Modifier.isStatic(field.getModifiers())) {
        continue;
      }
      if (out.length() > 1) {
        out.append(',');
      }
      out.append('"').append(field.getName()).append("\":").append(field.get(m));
    }
    return out.append(",\"ms\":0}").toString();
  }

  private static ThumbMeasures measure(BufferedImage image) {
    return ThumbMeasures.of(pixels(image), image.getWidth(), image.getHeight());
  }

  /** The measures with the perceptual hash `measureThumb` adds (#89). */
  private static String measured(BufferedImage image) throws IllegalAccessException {
    String json = json(measure(image));
    String hash = PerceptualHash.of(pixels(image), image.getWidth(), image.getHeight());
    return json.substring(0, json.length() - 1) + ",\"hash\":" + quote(hash) + "}";
  }

  /** The contour drawing of `image`, as `prepareForEink(..., 'png', true)` makes it on the device. */
  private static BufferedImage contour(BufferedImage image, File dest) throws Exception {
    if (dest.isFile()) {
      return decode(dest);
    }
    int width = image.getWidth();
    int height = image.getHeight();
    int[] argb = pixels(image);
    Decolor.apply(argb, width, height);
    Contour.apply(argb, width, height);
    EinkPixels.toEink(argb, true);
    BufferedImage out = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
    out.setRGB(0, 0, width, height, argb, 0, width);
    ImageIO.write(out, "png", dest);
    return out;
  }

  /**
   * The picture prepared without a contour, as `prepareForEink(..., 'png', false)` makes it: faint
   * lines darkened (#81).
   */
  private static BufferedImage darkened(BufferedImage image, File dest) throws Exception {
    if (dest.isFile()) {
      return decode(dest);
    }
    int width = image.getWidth();
    int height = image.getHeight();
    int[] argb = pixels(image);
    Decolor.apply(argb, width, height);
    EinkPixels.darken(argb, width, height);
    EinkPixels.toEink(argb, true);
    BufferedImage out = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
    out.setRGB(0, 0, width, height, argb, 0, width);
    ImageIO.write(out, "png", dest);
    return out;
  }

  private static String quote(String text) {
    return '"' + text.replace("\\", "\\\\").replace("\"", "\\\"") + '"';
  }

  public static void main(String[] args) throws Exception {
    BufferedReader in =
        new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    String suffix = "." + args[0] + ".contour.png";
    String line;
    while ((line = in.readLine()) != null) {
      if (line.isEmpty()) {
        continue;
      }
      File file = new File(line);
      File dest = new File(line + suffix);
      File darkDest = new File(line + "." + args[0] + ".dark.png");
      try {
        BufferedImage image = decode(file);
        String measures = measured(image);
        String converted = json(measure(contour(image, dest)));
        String dark = json(measure(darkened(image, darkDest)));
        System.out.println(
            "{\"file\":" + quote(line) + ",\"measures\":" + measures + ",\"contour\":" + converted
                + ",\"contourFile\":" + quote(dest.getPath()) + ",\"darkened\":" + dark
                + ",\"darkenedFile\":" + quote(darkDest.getPath()) + "}");
      } catch (Exception error) {
        // The class only: the message names the local file.
        System.out.println(
            "{\"file\":" + quote(line) + ",\"error\":" + quote(error.getClass().getSimpleName()) + "}");
      }
    }
  }
}
