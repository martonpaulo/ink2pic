# Device tests

One entry per build sent to the owner's Manta ([brief section 18](brief.md#18-device-test-protocol)).

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
