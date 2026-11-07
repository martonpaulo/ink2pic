# Device tests

One entry per build sent to the owner's Manta ([brief section 18](brief.md#18-device-test-protocol)).

## Contents

- [Build 0.1.0 (1), 2026-11-06, firmware 3.31.45](#build-010-1-2026-11-06-firmware-33145)
- [Build 0.1.0 (2), 2026-11-06, firmware 3.31.45](#build-010-2-2026-11-06-firmware-33145)
- [Build 0.1.0 (3), 2026-11-06, firmware 3.31.45](#build-010-3-2026-11-06-firmware-33145)
- [Build 0.1.0 (8), 2026-11-06, firmware 3.31.45](#build-010-8-2026-11-06-firmware-33145)
- [Build 0.1.0 (9), 2026-11-06, firmware 3.31.45](#build-010-9-2026-11-06-firmware-33145)
- [Build 0.1.0 (10), 2026-11-06, firmware 3.31.45](#build-010-10-2026-11-06-firmware-33145)
- [Build 0.1.0 (11), 2026-11-06, firmware 3.31.45](#build-010-11-2026-11-06-firmware-33145)
- [Build 0.1.0 (12), 2026-11-06, firmware 3.31.45](#build-010-12-2026-11-06-firmware-33145)
- [Build 0.1.0 (13), 2026-11-06, firmware 3.31.45](#build-010-13-2026-11-06-firmware-33145)
- [Build 0.1.0 (14), 2026-11-06, firmware 3.31.45](#build-010-14-2026-11-06-firmware-33145)
- [Build 0.1.0 (15), 2026-11-07, firmware 3.31.45](#build-010-15-2026-11-07-firmware-33145)

## Build 0.1.0 (1), 2026-11-06, firmware 3.31.45

Prerelease [`v0.1.0-dev.1`](https://github.com/martonpaulo/ink2pic/releases/tag/v0.1.0-dev.1), commit `3b46a22`, issue [#3](https://github.com/martonpaulo/ink2pic/issues/3). Screenshot: [`device-tests/0.1.0-1.jpg`](device-tests/0.1.0-1.jpg).

| Step | Expected | Result | Notes |
| --- | --- | --- | --- |
| 1-3 Install | Ink2Pic in the plugin list | Pass | Installed from `MyStyle` with Add Plugin |
| 4 Sidebar button, S0 | Native modules listed | Inconclusive | `NativeModules (0)`: the object lists no keys in PluginHost. `PixelRatio` 1.875, window 1024 x 1365.33, scale 1.875, `deviceType` 5 |
| 4 Sidebar button, S1 | Both sources answer over HTTPS | Pass | INTERNET answer 2 (always). Openclipart search HTTP 200, 18,322 chars, 32 detail links, 1,005 ms. Openclipart `400px` HTTP 200 `image/png` 24,197 bytes, 365 ms. Commons search HTTP 200, 3 `thumburl`, 885 ms |
| 4 Text box on the page | Report inserted with `insertText` | Pass | The text box appears below the handwriting |
| 6-7 Lasso button, S3 | "soup", "wine", "beer", "tree", "Napoleon" recognized | Fail | Every word: `error 117: Recognition failed. Please try again!` (4 to 8 lasso elements each). The build passed the lasso rect size; other plugins pass the page size |
| 8 Screenshots | Sent | Pass | One screenshot through the Inbox |

Follow-up: build 0.1.0 (2) probes the modules by name and passes the page size to `recognizeElements`.

## Build 0.1.0 (2), 2026-11-06, firmware 3.31.45

Prerelease [`v0.1.0-dev.2`](https://github.com/martonpaulo/ink2pic/releases/tag/v0.1.0-dev.2), commit `2bc4bce`, issue [#3](https://github.com/martonpaulo/ink2pic/issues/3). Screenshots: [`0.1.0-2-host.jpg`](device-tests/0.1.0-2-host.jpg), [`0.1.0-2-lasso.jpg`](device-tests/0.1.0-2-lasso.jpg).

| Step | Expected | Result | Notes |
| --- | --- | --- | --- |
| 1-3 Install | Ink2Pic updated | Pass | Published by the `Prerelease` workflow from a tag pushed on the Mac |
| 4 Sidebar button, S0 | Modules listed by name | Pass | Found as TurboModule and legacy: `BlobModule`, `FileReaderModule`, `Networking`, `ImageLoader`, `ImageStoreManager`, `RTNFileUtils`, `FileSelector`, `NativePluginAPI`, `NativePluginManager`, `NativeUIUtils`. None of `RNFSManager`, `RNFetchBlob`, `ReactNativeBlobUtil`, `RNCFileSystem`. No module writes bytes to a file or downloads to a file |
| 4 Sidebar button, S1 | Both sources answer | Pass | Openclipart 200 (32 links), `400px` 200, Commons 200 with 3 `thumburl` |
| 5-6 Lasso button, S3 | Words recognized | Fail | `getPageSize` failed with `1503: File read permission has not been requested`, so recognition was not attempted. The build declared and requested only `INTERNET` |
| 7-8 Screenshots | Sent | Pass | Two screenshots |

Owner's note: always log everything that can help debugging, and request the permissions other plugins request (file read and write). Build 0.1.0 (3) requests `FILE:READ`, `FILE:WRITE` and `INTERNET` first and prints a log of every SDK call with its answer.

## Build 0.1.0 (3), 2026-11-06, firmware 3.31.45

Prerelease [`v0.1.0-dev.3`](https://github.com/martonpaulo/ink2pic/releases/tag/v0.1.0-dev.3), commit `e27161e`, issue [#3](https://github.com/martonpaulo/ink2pic/issues/3), the first build the cloud published alone. Screenshots: [`0.1.0-3-host.jpg`](device-tests/0.1.0-3-host.jpg), [`0.1.0-3-lasso-1.jpg`](device-tests/0.1.0-3-lasso-1.jpg), [`0.1.0-3-lasso-3.jpg`](device-tests/0.1.0-3-lasso-3.jpg), [`0.1.0-3-lasso-4.jpg`](device-tests/0.1.0-3-lasso-4.jpg).

| Step | Expected | Result | Notes |
| --- | --- | --- | --- |
| 1-2 Install | Ink2Pic updated | Pass | |
| 3 Permissions | Each granted | Pass | `FILE:READ`, `FILE:WRITE`, `INTERNET`: granted before (always allow from earlier prompts) |
| 4-5 Lasso button, S3 | Five words recognized | Pass | "soup", "wine", "beer", "tree", "Napoleon", each exactly as written. `getPageSize` answered 1920 x 2560 in 15 to 18 ms; `recognizeElements` took 556 to 970 ms; `getLassoElements` 35 to 55 ms |
| 6 Sidebar button | S0 and S1 as in build 2 | Pass | Same modules; Openclipart search 817 ms, `400px` 56 ms, Commons 30 ms |
| 7-8 Screenshots and log | `[log]` readable | Pass | Lasso elements carry `stroke`, `numInPage`, `pageNum`, `layerNum`, `type` and `uuid` |

Result: S0, S1 and S3 are all answered; [#3](https://github.com/martonpaulo/ink2pic/issues/3) is done.

## Build 0.1.0 (8), 2026-11-06, firmware 3.31.45

Prerelease [`v0.1.0-dev.8`](https://github.com/martonpaulo/ink2pic/releases/tag/v0.1.0-dev.8), commit `39cfec4`. Seen on the owner's screen mirror.

| Step | Expected | Result | Notes |
| --- | --- | --- | --- |
| 2 Icon | A picture frame with a pen | Pass | In the plugin list (side bar) and as «Find picture» in the lasso menu ([#31](https://github.com/martonpaulo/ink2pic/issues/31)) |
| 3 Lasso, Find picture | Six pictures | Fail | The view stayed on «Starting…» with two log lines, `view mounted` and `lifecycle 1`: no button event, no lifecycle 2, and the 2-second watchdog timer never fired. Timers do not run while the host holds the view at lifecycle 1 |
| 4-8 | | Not run | Blocked by step 3 |

Follow-up: build 0.1.0 (9) decides on mount, with no button event and no timer: an active lasso selection opens the lasso flow, else an empty search ([#13](https://github.com/martonpaulo/ink2pic/issues/13)).

## Build 0.1.0 (9), 2026-11-06, firmware 3.31.45

Prerelease [`v0.1.0-dev.9`](https://github.com/martonpaulo/ink2pic/releases/tag/v0.1.0-dev.9), commit `42945ad`. Seen on the owner's screen mirror; the Manta was restarted after the install.

| Step | Expected | Result | Notes |
| --- | --- | --- | --- |
| 2 Lasso, Find picture | Six pictures | Fail | The view showed «Starting…» and 4 or 5 log lines for an instant, then closed. Nothing reached `MyStyle` (no `Ink2Pic` folder) |
| 3-8 | | Not run | Blocked by step 2 |

Cause, inferred: after deciding the flow, the view's first file call was `FileUtils.getExternalDirPath`; `RTNFileUtils` calls can throw inside the host, where JS cannot catch them, and the host closes the plugin (`j-raghavan/sn-dictionary`, device-verified [REPORTED]). Build 0.1.0 (10) no longer calls `FileUtils` in the product, writes the log file around every call from the start, and writes any JS error into the page and `crash.log` ([#13](https://github.com/martonpaulo/ink2pic/issues/13)).

## Build 0.1.0 (10), 2026-11-06, firmware 3.31.45

Prerelease [`v0.1.0-dev.10`](https://github.com/martonpaulo/ink2pic/releases/tag/v0.1.0-dev.10), commit `eee50aa`. Seen on the owner's screen mirror.

| Step | Expected | Result | Notes |
| --- | --- | --- | --- |
| Open from the side bar | Onboarding, then search | Pass, with a defect | `requestPermission(INTERNET)` hit the 20 s call limit while the dialog waited for the owner, so the view said network access was missing; Settings showed it allowed. Fixed: no limit on a dialog, and a check after each request ([#13](https://github.com/martonpaulo/ink2pic/issues/13)) |
| 2 Lasso, Find picture | Six pictures | Pass | `recognizeElements` gave "SOUP" in 1337 ms; Openclipart 32 and Commons 18 results; thumbnails stored |
| 3 Tap a picture | Picture at the word | Pass | A gray ladle placed at the lassoed word; the plugin closed |
| Page 2 of 9 | Pictures | Unclear | One screenshot shows «Searching…» with the pager at 2 / 9 and no pictures |
| 4-8 | | Not reported | |

## Build 0.1.0 (11), 2026-11-06, firmware 3.31.45

Prerelease [`v0.1.0-dev.11`](https://github.com/martonpaulo/ink2pic/releases/tag/v0.1.0-dev.11), commit `c2871d1`. Seen on the owner's screen mirror; the owner reported «all worked as expected» for the steps not shown.

| Step | Expected | Result | Notes |
| --- | --- | --- | --- |
| 2 Open, permissions | Log and Close, dialogs, then the search | Pass | Onboarding showed Log and Close; the dialog waited for the owner |
| 3 Lasso "apple" | Six pictures, «Loading pictures…» on page 2 | Pass | 1 / 8 pages |
| 4 Tap a picture | Just below the word | Pass | The word stays visible ([#39](https://github.com/martonpaulo/ink2pic/issues/39)) |
| 5 Wi-Fi off | The no-internet sentence and the Library | Pass | Owner report |
| 6 Network Access off | A sentence naming the internet permission | Fail, fixed | The onboarding cards showed with no word on what was missing; Start asked again. Fixed in `c198c4c`: the screen names each missing permission before Start ([#37](https://github.com/martonpaulo/ink2pic/issues/37)) |
| 7 New note, "cat" | A search for "cat" | Pass | Owner report |

## Build 0.1.0 (12), 2026-11-06, firmware 3.31.45

Prerelease [`v0.1.0-dev.12`](https://github.com/martonpaulo/ink2pic/releases/tag/v0.1.0-dev.12), commit `256aae2`. Seen on the owner's screen mirror and reported in chat.

| Step | Expected | Result | Notes |
| --- | --- | --- | --- |
| 2 Network Access off, Find picture | «Ink2Pic needs internet access…» above Start | Pass | Start then showed the host's «Unable to Access the Network» dialog with Go to Settings |
| 3 Allow, search again | The search runs | Pass | The lasso context was gone after Settings, so the screen said «Could not read the word. Type it instead.»; the typed word searched |
| Library after the install | The pictures saved in builds 10 and 11 | Fail, fixed | «No saved pictures yet»: `library.json` lived in the private folder, which an install empties ([#41](https://github.com/martonpaulo/ink2pic/issues/41)) |
| Keyboard after a typed search | The six tiles and the pager | Fail, fixed | The keyboard stayed open over half of the grid ([#42](https://github.com/martonpaulo/ink2pic/issues/42)) |
| 4 Lasso "apple" again | Pictures at once, from the device | Pass | Owner report ([#16](https://github.com/martonpaulo/ink2pic/issues/16)) |
| 5 `MyStyle/Ink2Pic/logs/` | `session.log` | Pass | Owner report ([#21](https://github.com/martonpaulo/ink2pic/issues/21)) |

## Build 0.1.0 (13), 2026-11-06, firmware 3.31.45

Prerelease [`v0.1.0-dev.13`](https://github.com/martonpaulo/ink2pic/releases/tag/v0.1.0-dev.13), commit `c94ff7d`. Owner report «everything worked except half of the pictures», with a screenshot of the Log.

| Step | Expected | Result | Notes |
| --- | --- | --- | --- |
| 2 to 4, 6, 7 | Library kept, typical pictures first, latest press wins, keyboard closes | Pass | Owner report; Wikidata answered (`source wikidata: ok, count 1` for "apple") |
| 5 Tap a picture | Just below the word | Fail on about half | `SecurityException: no DELETE permission` on the second write of `insert-download.png` and of `library.json`: PluginHost counts replacing a shared file as a delete ([#62](https://github.com/martonpaulo/ink2pic/issues/62)) |

## Build 0.1.0 (14), 2026-11-06, firmware 3.31.45

Prerelease [`v0.1.0-dev.14`](https://github.com/martonpaulo/ink2pic/releases/tag/v0.1.0-dev.14), commit `fb69a0d`. Owner report «everything working».

| Step | Expected | Result | Notes |
| --- | --- | --- | --- |
| 2 Four inserts in a row | All four in the note | Pass | Shared files written in place ([#62](https://github.com/martonpaulo/ink2pic/issues/62)) |
| 3, 4 Library, then reopen | The four pictures, kept | Pass | `library.json` saves every time |

## Build 0.1.0 (15), 2026-11-07, firmware 3.31.45

Prerelease [`v0.1.0-dev.15`](https://github.com/martonpaulo/ink2pic/releases/tag/v0.1.0-dev.15), commit `9ffa54c`, check card E15. Owner screenshots and two session logs.

| Step | Expected | Result | Notes |
| --- | --- | --- | --- |
| 2 Insert picture on «apple» | An apple drawing, inserted at once, lassoed | Partial | Inserted at once and lassoed ([#74](https://github.com/martonpaulo/ink2pic/issues/74), [#73](https://github.com/martonpaulo/ink2pic/issues/73)); the picture was the Apple logo outline, and 3 of 6 page-1 pictures were dark ([#81](https://github.com/martonpaulo/ink2pic/issues/81)) |
| 3 «apple logo» | The Apple logo on page 1 | Fail | Sub-brand wordmarks and 2 unrelated pictures on page 1; the plain logo first on page 2 ([#81](https://github.com/martonpaulo/ink2pic/issues/81)) |
| 4 «Miguel de Cervantes» | Drawings and the portrait first; no signature, no text-only picture | Partial | No signature; a monument first, a namesake logo, a quote poster and speckled contours on page 1; the owner's best pick, a clean engraving bust, first on page 2 ([#83](https://github.com/martonpaulo/ink2pic/issues/83)) |
| 5 «Confucious Institute» | «Showing results for» and pictures | Fail | 2 photos and no correction line: the suggestion runs only on an empty page ([#84](https://github.com/martonpaulo/ink2pic/issues/84)); the owner expects the institute's logo ([#81](https://github.com/martonpaulo/ink2pic/issues/81)) |
| 6 Probe pen and page | The view closes and a picture gets the lasso | Pass | The plugin can lasso by itself ([#75](https://github.com/martonpaulo/ink2pic/issues/75)) |
| 7 Lasso last word | Only that word lassoed | Partial | A lone «banana» passes; in phrases only «o» of «frio» and «na» of «China»: the walk stops at an i-dot ([#75](https://github.com/martonpaulo/ink2pic/issues/75)) |
| 8 Session log | Sent | Pass | Letter gaps 6–20 px, word gaps 48–60 px; pauses inside and between words overlap (130–656 ms against 578–1122 ms); `lassoElements` false on a 53 × 52 rect |

