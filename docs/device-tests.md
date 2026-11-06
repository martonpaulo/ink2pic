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
