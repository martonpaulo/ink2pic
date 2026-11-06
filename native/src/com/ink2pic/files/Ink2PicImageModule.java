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
import java.util.concurrent.Executors;

/**
 * Prepares a saved picture for the 16-gray e-ink screen (brief sections 7 and 9.4, issue #17):
 * bounds-first decode, scale down to the target width, flatten on white, gray with the e-ink
 * contrast curve, encode.
 */
public final class Ink2PicImageModule extends ReactContextBaseJavaModule {
  private static final String PNG = "png";
  private static final String JPG = "jpg";
  /** JPG quality [INFERENCE, to calibrate on device against the 50 to 150 KB target]. */
  private static final int JPG_QUALITY = 85;
  /** PNG is lossless, so the encoder ignores its quality. */
  private static final int PNG_QUALITY = 100;
  private final ExecutorService worker = Executors.newSingleThreadExecutor();

  public Ink2PicImageModule(ReactApplicationContext context) {
    super(context);
  }

  @Override
  public String getName() {
    return "Ink2PicImage";
  }

  /** Resolves {width, height, bytes} of the file written to `destPath`. */
  @ReactMethod
  public void prepareForEink(
      String srcPath, String destPath, double targetWidth, String format, Promise promise) {
    ModuleWork.submit(worker, promise, () -> {
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
      Bitmap prepared = prepare(source, width, png);
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
        return result;
      } finally {
        prepared.recycle();
      }
    });
  }

  /**
   * The gray picture at its output size. PNG is quantized to the screen's 16 levels, which also
   * shrinks the file; JPG is not, since its compression would blur the levels again
   * [TO TEST, brief section 7, step 5].
   */
  private static Bitmap prepare(File source, int targetWidth, boolean quantize) throws Exception {
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
    if (size[0] != decoded.getWidth()) {
      scaled = Bitmap.createScaledBitmap(decoded, size[0], size[1], true);
      decoded.recycle();
    }
    int[] pixels = new int[size[0] * size[1]];
    // getPixels returns unpremultiplied colors, the form EinkPixels expects.
    scaled.getPixels(pixels, 0, size[0], 0, 0, size[0], size[1]);
    scaled.recycle();
    EinkPixels.toEink(pixels, quantize);
    Bitmap gray = Bitmap.createBitmap(pixels, size[0], size[1], Bitmap.Config.ARGB_8888);
    gray.setHasAlpha(false);
    return gray;
  }
}
