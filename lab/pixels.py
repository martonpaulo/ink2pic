#!/usr/bin/env python3
"""Pixel measures of thumbnails for the search lab (#63), with Pillow.

    pixels.py < files.json > measures.json

Reads a JSON list of image files and prints, per file: the mean luminance (0 to 255) with the
transparent parts shown on white and on black, the share of dark pixels on white, and the share
of transparent pixels. An unreadable file gets an `error`.
"""
import json
import sys

from PIL import Image, ImageStat

DARK = 64  # luminance below a quarter of white
OPAQUE = 128  # alpha at half or more
WHITE = 255
BLACK = 0
SHARE_DIGITS = 3


def measure(file):
    with Image.open(file) as image:
        rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    luma = rgba.convert("RGB").convert("L")
    count = luma.width * luma.height
    on = {}
    for name, ground in (("white", WHITE), ("black", BLACK)):
        flat = Image.new("L", luma.size, ground)
        flat.paste(luma, mask=alpha)
        on[name] = flat
    white = on["white"].histogram()
    return {
        "meanOnWhite": round(ImageStat.Stat(on["white"]).mean[0], 1),
        "meanOnBlack": round(ImageStat.Stat(on["black"]).mean[0], 1),
        "darkOnWhite": round(sum(white[:DARK]) / count, SHARE_DIGITS),
        "transparent": round(sum(alpha.histogram()[:OPAQUE]) / count, SHARE_DIGITS),
    }


def main():
    out = {}
    for file in json.load(sys.stdin):
        try:
            out[file] = measure(file)
        except (OSError, ValueError) as error:
            # The class only: the message names the local file.
            out[file] = {"error": type(error).__name__}
    json.dump(out, sys.stdout)


if __name__ == "__main__":
    main()
