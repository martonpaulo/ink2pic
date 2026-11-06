#!/usr/bin/env bash
# Renders design/social-card/social-card.html to design/social-card/social-card.jpg
# (1200x630, JPEG q92, 4:4:4, progressive, metadata stripped), the repository's social preview (#40).
# Copied from Skill Deck's project-release/assets/social-card.sh; changed: the output path, and
# ImageMagick 6's `convert` when ImageMagick 7's `magick` is missing. Needs Node and ImageMagick.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
im=magick
command -v magick >/dev/null || im=convert
npx --yes playwright@1.63.0 screenshot --viewport-size="1200,630" \
  "file://$PWD/design/social-card/social-card.html" "$tmp/card.png" >/dev/null
"$im" "$tmp/card.png" -strip -colorspace sRGB -quality 92 -sampling-factor 4:4:4 -interlace Plane \
  design/social-card/social-card.jpg
