# Notice

Ink2Pic is MIT-licensed ([LICENSE](LICENSE)). It adapts third-party work:

| Project | License | What Ink2Pic uses | Details |
| --- | --- | --- | --- |
| [Keplex/supernote-pic2note](https://github.com/Keplex/supernote-pic2note) at `5a210f8` | MIT | The light native build pipeline without Gradle | [below](#keplexsupernote-pic2note) |
| [Gabarito](https://github.com/naipefoundry/gabarito), `@fontsource/gabarito` 5.3.0 | OFL-1.1 | The name on the social card, 700 latin WOFF2 | [OFL-Gabarito.txt](design/social-card/fonts/OFL-Gabarito.txt) |
| [Figtree](https://github.com/erikdkennedy/figtree), `@fontsource/figtree` 5.3.0 | OFL-1.1 | The other social-card text, 500 and 700 latin WOFF2 | [OFL-Figtree.txt](design/social-card/fonts/OFL-Figtree.txt) |
| [Caveat](https://github.com/googlefonts/caveat), `@fontsource/caveat` 5.3.0 | OFL-1.1 | The handwritten word on the social card, 600 latin WOFF2 | [OFL-Caveat.txt](design/social-card/fonts/OFL-Caveat.txt) |
| [Openclipart 185227 "tureen"](https://openclipart.org/detail/185227) by johnny_automatic, from Dorothy Daly's *Italian Cooking* (not in copyright) | CC0-1.0 | The engraving on the social card, unchanged SVG | [tureen.svg](design/social-card/tureen.svg) |

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
