package com.ink2pic.files;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.util.concurrent.ExecutorService;

/**
 * Prepares a saved picture for the 16-gray e-ink screen (brief sections 7 and 9.4, issue #17):
 * bounds-first decode, scale down to the target width, flatten on white, gray that keeps the
 * contrast between colours (#89), the e-ink contrast curve, encode.
 */
public final class Ink2PicImageModule extends ReactContextBaseJavaModule {
  private static final String PNG = "png";
  private static final String JPG = "jpg";
  /** JPG quality [INFERENCE, to calibrate on device against the 50 to 150 KB target]. */
  private static final int JPG_QUALITY = 85;
  /** PNG is lossless, so the encoder ignores its quality. */
  private static final int PNG_QUALITY = 100;
  /** Thumbnails come at 330 (Commons) and 400 px (Openclipart); larger files are sampled down. */
  private static final int MEASURE_WIDTH = 400;
  private static final double NANOS_PER_MS = 1e6;
  private final Workers workers = new Workers();
  private final ExecutorService worker = workers.single();

  public Ink2PicImageModule(ReactApplicationContext context) {
    super(context);
  }

  @Override
  public String getName() {
    return "Ink2PicImage";
  }

  /** A new React instance makes a new module: this one's thread stops with it (#95). */
  @Override
  public void invalidate() {
    workers.shutdown();
    super.invalidate();
  }

  /**
   * Resolves {width, height, bytes, ms} of the file written to `destPath`; `ms` is the whole
   * preparation. With `contour`, the picture is first turned into a contour drawing (#66).
   */
  @ReactMethod
  public void prepareForEink(
      String srcPath,
      String destPath,
      double targetWidth,
      String format,
      boolean contour,
      Promise promise) {
    ModuleWork.submit(worker, promise, () -> {
      long start = System.nanoTime();
      File source = SafePaths.checkPath(srcPath);
      File target = SafePaths.checkPath(destPath);
      int width = (int) targetWidth;
      if (width < 1 || width != targetWidth) {
        throw new SafePaths.Refused("BAD_WIDTH", "a positive whole target width is required: " + targetWidth);
      }
      boolean png = PNG.equals(format);
      if (!png && !JPG.equals(format)) {
        throw new SafePaths.Refused("BAD_FORMAT", "format must be png or jpg: " + format);
      }
      Bitmap prepared = prepare(source, width, png, contour);
      try {
        ByteArrayOutputStream encoded = new ByteArrayOutputStream();
        Bitmap.CompressFormat codec = png ? Bitmap.CompressFormat.PNG : Bitmap.CompressFormat.JPEG;
        if (!prepared.compress(codec, png ? PNG_QUALITY : JPG_QUALITY, encoded)) {
          throw new SafePaths.Refused("ENCODE", "cannot encode " + format + " for " + destPath);
        }
        long bytes = ModuleWork.writeAtomically(
            target, new ByteArrayInputStream(encoded.toByteArray()));
        WritableMap result = Arguments.createMap();
        result.putInt("width", prepared.getWidth());
        result.putInt("height", prepared.getHeight());
        result.putDouble("bytes", (double) bytes);
        result.putDouble("ms", (System.nanoTime() - start) / NANOS_PER_MS);
        return result;
      } finally {
        prepared.recycle();
      }
    });
  }

  /**
   * The thumbnail's pixel measures (#66): features only; `src/search/measures.ts` reads them.
   * Resolves {width, height, mean, ..., ms}, `ms` the decode and measure time for the device log.
   */
  @ReactMethod
  public void measureThumb(String path, Promise promise) {
    ModuleWork.submit(worker, promise, () -> {
      long start = System.nanoTime();
      Pixels decoded = decode(SafePaths.checkPath(path), MEASURE_WIDTH);
      ThumbMeasures m = ThumbMeasures.of(decoded.argb, decoded.width, decoded.height);
      WritableMap result = Arguments.createMap();
      result.putInt("width", m.width);
      result.putInt("height", m.height);
      result.putDouble("mean", m.mean);
      result.putDouble("dark", m.dark);
      result.putDouble("white", m.white);
      result.putDouble("mid", m.mid);
      result.putDouble("border", m.border);
      result.putInt("borderMedian", m.borderMedian);
      result.putDouble("ink", m.ink);
      result.putInt("inkLeft", m.inkLeft);
      result.putInt("inkTop", m.inkTop);
      result.putInt("inkWidth", m.inkWidth);
      result.putInt("inkHeight", m.inkHeight);
      result.putInt("bands", m.bands);
      result.putDouble("lineAspect", m.lineAspect);
      result.putDouble("thickness", m.thickness);
      result.putDouble("edge", m.edge);
      result.putDouble("edgeBox", m.edgeBox);
      result.putInt("colours", m.colours);
      result.putDouble("objectShare", m.objectShare);
      result.putString("hash", PerceptualHash.of(decoded.argb, decoded.width, decoded.height));
      result.putDouble("fragments", m.fragments);
      result.putInt("darkest", m.darkest);
      result.putBoolean("faintLines", m.faintLines);
      result.putDouble("ms", (System.nanoTime() - start) / NANOS_PER_MS);
      return result;
    });
  }

  /** Decoded pixels, unpremultiplied ARGB, and their size. */
  private static final class Pixels {
    final int[] argb;
    final int width;
    final int height;

    Pixels(int[] argb, int width, int height) {
      this.argb = argb;
      this.width = width;
      this.height = height;
    }
  }

  /**
   * The picture's pixels scaled down to `targetWidth` and the page height (never up): bounds-first
   * decode with a power-of-two sample size, then one bitmap scale.
   */
  private static Pixels decode(File source, int targetWidth) throws Exception {
    if (!source.isFile()) {
      throw new SafePaths.Refused("NOT_FOUND", "no file at " + source);
    }
    BitmapFactory.Options bounds = new BitmapFactory.Options();
    bounds.inJustDecodeBounds = true;
    BitmapFactory.decodeFile(source.getPath(), bounds);
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
      throw new SafePaths.Refused("NOT_IMAGE", "cannot read an image from " + source);
    }
    BitmapFactory.Options options = new BitmapFactory.Options();
    options.inSampleSize = EinkPixels.sampleSize(bounds.outWidth, bounds.outHeight, targetWidth);
    options.inPreferredConfig = Bitmap.Config.ARGB_8888;
    Bitmap decoded = BitmapFactory.decodeFile(source.getPath(), options);
    if (decoded == null) {
      throw new SafePaths.Refused("NOT_IMAGE", "cannot decode " + source);
    }
    int[] size = EinkPixels.targetSize(decoded.getWidth(), decoded.getHeight(), targetWidth);
    Bitmap scaled = decoded;
    if (size[0] != decoded.getWidth() || size[1] != decoded.getHeight()) {
      scaled = Bitmap.createScaledBitmap(decoded, size[0], size[1], true);
      decoded.recycle();
    }
    int[] pixels = new int[size[0] * size[1]];
    // getPixels returns unpremultiplied colors, the form EinkPixels expects.
    scaled.getPixels(pixels, 0, size[0], 0, 0, size[0], size[1]);
    scaled.recycle();
    return new Pixels(pixels, size[0], size[1]);
  }

  /**
   * The gray picture at its output size. PNG is quantized to the screen's 16 levels, which also
   * shrinks the file; JPG is not, since its compression would blur the levels again
   * [TO TEST, brief section 7, step 5]. A contour drawing is made at the output size.
   */
  private static Bitmap prepare(File source, int targetWidth, boolean quantize, boolean contour)
      throws Exception {
    Pixels pixels = decode(source, targetWidth);
    // Gray that keeps the contrast between colours, before the contour and the e-ink curve (#89).
    Decolor.apply(pixels.argb, pixels.width, pixels.height);
    if (contour) {
      Contour.apply(pixels.argb, pixels.width, pixels.height);
    } else {
      // Faint light-grey line work gets its darkest ink black (#81).
      EinkPixels.darken(pixels.argb, pixels.width, pixels.height);
    }
    EinkPixels.toEink(pixels.argb, quantize);
    Bitmap gray =
        Bitmap.createBitmap(pixels.argb, pixels.width, pixels.height, Bitmap.Config.ARGB_8888);
    gray.setHasAlpha(false);
    return gray;
  }
}
