# Notice

Ink2Pic is MIT-licensed ([LICENSE](LICENSE)). It adapts third-party work:

| Project | License | What Ink2Pic uses | Details |
| --- | --- | --- | --- |
| [Keplex/supernote-pic2note](https://github.com/Keplex/supernote-pic2note) at `5a210f8` | MIT | The light native build pipeline without Gradle | [below](#keplexsupernote-pic2note) |
| [Gabarito](https://github.com/naipefoundry/gabarito), `@fontsource/gabarito` 5.3.0 | OFL-1.1 | The name on the social card, 700 latin WOFF2 | [OFL-Gabarito.txt](design/social-card/fonts/OFL-Gabarito.txt) |
| [Figtree](https://github.com/erikdkennedy/figtree), `@fontsource/figtree` 5.3.0 | OFL-1.1 | The other social-card text, 500 and 700 latin WOFF2 | [OFL-Figtree.txt](design/social-card/fonts/OFL-Figtree.txt) |
| [Caveat](https://github.com/googlefonts/caveat), `@fontsource/caveat` 5.3.0 | OFL-1.1 | The handwritten word on the social card, 600 latin WOFF2 | [OFL-Caveat.txt](design/social-card/fonts/OFL-Caveat.txt) |
| [OpenMoji](https://github.com/hfg-gmuend/openmoji) 17.0.0, `data/openmoji.json` at `f9fc506` | CC-BY-SA-4.0 | The symbols' names and keywords in the shipped index; the pictures, fetched at search time | [below](#openmoji-and-keyword-data) |
| [emojilib](https://github.com/muan/emojilib) 4.0.3, `dist/emoji-en-US.json` at `b4da694` | MIT | English keywords in the OpenMoji index | [below](#openmoji-and-keyword-data) |
| [CLDR annotations](https://github.com/unicode-org/cldr-json) 49.0.0, `cldr-annotations-full` pt, es, zh at `a4b6724` | Unicode-3.0 | Portuguese, Spanish and Chinese names and keywords in the OpenMoji index | [below](#openmoji-and-keyword-data) |
| [Openclipart 185227 "tureen"](https://openclipart.org/detail/185227) by johnny_automatic, from Dorothy Daly's *Italian Cooking* (not in copyright) | CC0-1.0 | The engraving on the social card, unchanged SVG | [tureen.svg](design/social-card/tureen.svg) |

## OpenMoji and keyword data

`src/search-core/data/openmoji-index.json` is built by `scripts/build-openmoji-index.cjs` from
these files, each pinned to a commit and a SHA-256 in the script ([#67](https://github.com/martonpaulo/ink2pic/issues/67)):

- `https://raw.githubusercontent.com/hfg-gmuend/openmoji/f9fc506a3f913be9897ab0181d611d4c910a4104/data/openmoji.json`:
  OpenMoji 17.0.0 by HfG Schwäbisch Gmünd and the OpenMoji contributors, CC BY-SA 4.0
  (<https://creativecommons.org/licenses/by-sa/4.0/>). Taken: hexcode, annotation, tags,
  openmoji_tags and group. Changed: folded to lowercase without accents; flags, skin tones, the
  «man» and «woman» twins and the OpenMoji and Unicode extras (brand logos among them) left out.
  The index, as an adaptation of this data, is under CC BY-SA 4.0 too.
- `https://raw.githubusercontent.com/muan/emojilib/b4da69426d5dc6e8c8c02c09b163ff3e7160b316/dist/emoji-en-US.json`:
  emojilib 4.0.3, MIT, copyright (c) Mu-An Chiou. Taken: the keywords, folded.
- `https://raw.githubusercontent.com/unicode-org/cldr-json/a4b67247b446fd51b475991017a2481911210c60/cldr-json/cldr-annotations-full/annotations/<pt|es|zh>/annotations.json`:
  Unicode CLDR 49.0.0, Unicode License V3, copyright (c) 1991-2026 Unicode, Inc.
  (<https://www.unicode.org/license.txt>). Taken: each emoji's name (`tts`) and keywords
  (`default`), folded.

The pictures, `https://raw.githubusercontent.com/hfg-gmuend/openmoji/f9fc506a3f913be9897ab0181d611d4c910a4104/black/618x618/<HEX>.png`
at the same pinned commit as the keywords, recorded as `pictures` in the index and checked by `--check`
([#99](https://github.com/martonpaulo/ink2pic/issues/99)), are OpenMoji's, CC BY-SA 4.0: each result and each saved picture records the credit «OpenMoji» and
the license. The copies kept for offline use in `MyStyle/Ink2Pic/symbols/` are unchanged OpenMoji
pictures under the same CC BY-SA 4.0 licence; Settings names it before the download
([#91](https://github.com/martonpaulo/ink2pic/issues/91)).

## Keplex/supernote-pic2note

- Repository: <https://github.com/Keplex/supernote-pic2note>
- Revision: `5a210f868d06142730a56936846f63dce17475e9`, read on 2026-11-06
- Author: Keplex
- License: MIT, copyright (c) 2026 Keplex

Adapted: the light native build without Gradle (`native/BUILD.md` and `scripts/native-build.cjs`
of that repository): `javac` for Java 8, D8 with minimum API 27, `aapt2 link`, and an APK-format
`app.npk` added with `nativeCodePackage` and `reactPackages` to the plugin package. Ink2Pic's
`scripts/native-build.cjs` is a new script that follows this pipeline. Changed: it uses the
`zip` and `unzip` commands instead of the `fflate` library, writes the Android manifest from
`PluginConfig.json`, gets its tools from `scripts/native-toolchain.sh` with pinned SHA-1 checks,
and runs Ink2Pic's own JVM tests. Not taken: Pic2Note's Java code, image editor and Windows
toolchain discovery.

The MIT license text:

```text
MIT License

Copyright (c) 2026 Keplex

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
