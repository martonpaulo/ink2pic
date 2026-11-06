# Ink2Pic: Supernote Image Plugin Technical Brief

Status: research and planning complete, no production code written yet.
Date of research: 2026-11-06. Last updated: 2026-11-06.
Audience: a coding agent that will start implementing the plugin.

This document is the single source of truth for the project. It records the research, the decisions agreed with the owner, the defaults chosen for undecided items, and the implementation plan. When a spike or a device test produces a result, update this document in the same change.

Every claim is tagged:

| Tag | Meaning |
| --- | --- |
| **[CONFIRMED]** | Verified in source code, an official document, or a direct test during research |
| **[REPORTED]** | Stated by another developer from on-device experience, not verified by us |
| **[INFERENCE]** | Reasoned conclusion, not verified |
| **[TO TEST]** | Must be verified on the owner's device before relying on it |
| **[DEFAULT]** | A choice made so work can start. The owner may change it later. Proceed with it, do not stop to ask |

Do not upgrade an [INFERENCE] or [TO TEST] item to fact without running it.

## Contents

- [0. Quick start for the agent](#0-quick-start-for-the-agent)
- [1. Product goal](#1-product-goal)
- [2. Owner environment](#2-owner-environment)
- [3. Platform facts: Supernote plugin system](#3-platform-facts-supernote-plugin-system)
- [4. SDK API surface relevant to this plugin](#4-sdk-api-surface-relevant-to-this-plugin)
- [5. Image sources](#5-image-sources)
- [6. Native code decision](#6-native-code-decision)
- [7. Image preparation for e-ink](#7-image-preparation-for-e-ink)
- [8. UX specification (agreed)](#8-ux-specification-agreed)
- [9. Implementation plan](#9-implementation-plan)
- [10. Engineering practices](#10-engineering-practices)
- [11. Risks](#11-risks)
- [12. Decisions taken by default](#12-decisions-taken-by-default)
- [13. History of options considered and rejected](#13-history-of-options-considered-and-rejected)
- [14. Sources](#14-sources)
- [15. Research log](#15-research-log)
- [16. Development environment and delivery](#16-development-environment-and-delivery)
- [17. Repository and conventions](#17-repository-and-conventions)
- [18. Device test protocol](#18-device-test-protocol)

## 0. Quick start for the agent

Read in this order: sections 1, 2, 16, 17, 6, 9, then the rest as needed.

Project identity [DEFAULT, see section 12 for alternatives]:

| Item | Value |
| --- | --- |
| Display name | `Ink2Pic` |
| Tagline | Write a word, get a picture. |
| `pluginKey` and RN `appName` | `Ink2Pic` |
| Repository | `martonpaulo/ink2pic` on GitHub, **public** (owner decision) |
| Default branch | `main` |
| License | MIT |
| Shared-storage folder | `MyStyle/Ink2Pic/` |
| HTTP User-Agent | `Ink2Pic/<versionName> (+https://github.com/martonpaulo/ink2pic)` |

The first concrete task is section 9.1, spike plugin S0 + S1 + S3 (JavaScript only).

---

## 1. Product goal

The owner wants to find an illustration, engraving or picture of a real thing (examples: "soup", "wine", "beer", "tree", historical people) **from inside the Supernote**, and get it into the current note immediately, with no computer and no phone involved.

User story, in the owner's words (translated): "In an app, search for an image of a person or illustration, select it, and it is already available in my Supernote. Another day I want another image about a topic I am studying, and so on."

### 1.1 Quality bar agreed with the owner

The owner explicitly asked for this, not for more features:

- A perfect usage flow with the fewest steps.
- Good speed.
- The least possible manual "adjustment" after inserting.
- Fast and easy installation.
- Easy to understand without a manual.
- Images of adequate quality, not heavy, already rendered properly for the Supernote e-ink screen.

### 1.2 Hard requirements

1. **English only.** Plugin UI, search terms, code, identifiers, comments, docs and commit messages are in English. This is a requirement set by the owner, not a preference.
2. **No external service.** No backend, no proxy, no Cloudflare Worker, no server the owner has to maintain. The owner rejected this explicitly.
3. **No companion phone app.** Everything happens on the Supernote.
4. **Keyless sources.** No API keys, no accounts, no sign-up for the user.
5. **Prefer TypeScript for everything.** Use native Java only for what JavaScript provably cannot do (see section 6).

### 1.3 Out of scope

- Native Supernote stickers (`.snstk` collections). Importing a collection always requires a manual tap on Import in the Sticker panel, so it cannot be automated. The plugin keeps its own image library instead (section 8.6).
- Translation of non-English queries. A Wikidata-based translation idea was discussed and **dropped** because the owner accepted English as a requirement.
- Settings screens in the main flow.
- iOS, A5/A6 (first generation). Target is Manta first, Nomad and A5X/A6X are optional later.

---

## 2. Owner environment

| Item | Value |
| --- | --- |
| Target device | Supernote Manta (A5 X2) |
| Device firmware | **Chauvet 3.31.45** (stable, released 2026-10-20) |
| Device screen | 1920 x 2560 px, 16 gray levels [CONFIRMED, Ratta template docs and 3.31.45 changelog] |
| `getDeviceType()` value for Manta | `5` (`A5X2`) [CONFIRMED, SDK source] |
| Dev machine | A low-memory Mac, macOS 26, zsh, Cursor / IntelliJ |
| Owner skills | Senior full-stack dev, React / TypeScript / React Native, Swift, Java (learning) |
| Owner phone | An iPhone (not used by the plugin) |

The low memory matters: a full Gradle Android build is slow on this machine. Prefer the light native build path (section 6.3).

---

## 3. Platform facts: Supernote plugin system

### 3.1 Firmware timeline

| Firmware (Manta/Nomad) | Date | Relevance |
| --- | --- | --- |
| 3.29.42 / 3.29.43 / 3.29.44 beta | Aug 2026 | Plugin preview builds, new permission system, breaking SDK changes [CONFIRMED, Ratta r/Supernote_dev announcement] |
| 3.30.45 | 2026-10-12 | Plugins reach stable firmware. Toolbar customization. Non-proportional scaling of "shapes and images added via plugins" [CONFIRMED, official changelog] |
| 3.31.45 | 2026-10-20 | Owner's version. Fixes 16-level grayscale and some browser pages [CONFIRMED, official changelog] |

Ratta's announcement for the 3.29.44 beta told developers to update `sn-plugin-lib` or their plugin would not work on the new build [CONFIRMED]. Several developers report that builds for old firmware show "package not compatible" or do nothing on new firmware and vice versa [REPORTED, AgP42/SuperFun, AgP42/SuperStickyNote, Clipper release notes].

### 3.2 SDK: `sn-plugin-lib`

npm versions and publish dates [CONFIRMED, `npm view sn-plugin-lib time`]:

| Version | Published |
| --- | --- |
| 0.1.19 | early 2026 |
| 0.1.43 | 2026-05-15 |
| 0.1.65 | 2026-08-24 |
| **0.2.3** | **2026-10-12** (same day as firmware 3.30.45) |

**Use `sn-plugin-lib` 0.2.3, pinned exactly.**

Important trap [CONFIRMED]: the official project template `@supernote-plugin/sn-plugin-template` (1.0.13, modified 2026-10-06) still generates `"sn-plugin-lib": "^0.1.19"`. A freshly scaffolded project must be upgraded:

```bash
npm install sn-plugin-lib@0.2.3 --save-exact
```

Inference: the known-broken "Insert Image" plugin (`wolfsolver/supernote-image-insert-plugin`, [issue 16](https://github.com/wolfsolver/supernote-image-insert-plugin/issues/16), opened 2026-10-21, "button never appears in NOTE toolbar on Chauvet 3.31.45") declares `sn-plugin-lib ^0.1.19`. An outdated SDK is the most likely cause [INFERENCE]. Plugins built on 0.2.3 (SuperClaude, Pic2Note, Inkling) are actively maintained on current firmware, and SuperClaude states it requires firmware 3.30+ and was tested on a Manta [REPORTED].

### 3.3 Runtime

- React Native **0.79.2** and React 19.0.0 are locked. They must match the PluginHost runtime. Do not upgrade [REPORTED, apclark31 and gorlix notes, template pins 0.79.2].
- `newArchEnabled=false`, `hermesEnabled=true` in the template [CONFIRMED].
- The JS is shipped as a Hermes bytecode bundle produced by `buildPlugin.sh` [CONFIRMED in script].
- The plugin code runs inside the system process `com.ratta.supernote.pluginhost`. A plugin's own Android manifest governs nothing, because the native APK is never installed as an app [REPORTED, ink2task source comments].
- Plugins lose their in-memory state when their window is hidden. Persist anything important [REPORTED, SuperClaude README].
- JS timers suspend while the plugin view is closed. Never rely on timers for flushing [REPORTED, apclark31].
- No dev console. ADB logcat availability is contradictory: apclark31 reports `shell/logcat/push/pull` return "not support command", gorlix documents a working `adb logcat` workflow [REPORTED, conflicting]. Plan for on-device logging (section 10.3).

### 3.4 Package format and installation

- Build output: `build/outputs/<name>.snplg`, a ZIP of `PluginConfig.json`, the JS bundle, the icon, and optionally `app.npk` (native code) [CONFIRMED, `buildPlugin.sh`].
- Install: copy the `.snplg` to the device `MyStyle/` folder, then `Settings > Apps > Plugins > Add Plugin` [CONFIRMED, multiple READMEs].
- Gotcha: reinstalling from the existing plugin entry reinstalls the host's managed copy at `MyStyle/Plugins/<name>.snplg`, not the new file in `MyStyle/`. Overwrite that managed copy, or use Add Plugin and pick the new file [REPORTED, gorlix SKILL gotcha 39].
- JS-only changes reload when the plugin view reopens. Native (Java/Kotlin) changes need the plugin host process restarted, in practice a device restart [REPORTED, gorlix, Pic2Note README].
- Limits: 30 installed plugins, 10 enabled [CONFIRMED, Ratta 3.29.44 announcement].

### 3.5 `PluginConfig.json`

Key fields [CONFIRMED, template script and gorlix reference]:

| Field | Rule |
| --- | --- |
| `pluginKey` | Must equal the `appName` passed to `AppRegistry.registerComponent`. Mismatch means the plugin does not load |
| `pluginID` | Auto-generated 16 chars on first build. **Never change it after first install**, or the device treats it as a new plugin and the library is lost |
| `name`, `desc` | String or `{ "en": "...", ... }` object |
| `iconPath` | Relative path to the icon PNG |
| `versionName`, `versionCode` | Increase `versionCode` on every build that goes to the device |
| `jsMainPath` | `index` |
| `uses-permissions` | **Required.** Every permission the code requests must be listed here, or `requestPermission` fails with error `1500` and no dialog appears |
| `nativeCodePackage` | `/app.npk`, set by the build when native code exists |
| `reactPackages` | Fully qualified ReactPackage class names. PluginHost discovers native modules **only** through this array, not through `MainApplication.getPackages()`. If your own package is missing, `NativeModules.X` is `null` at runtime with no error [REPORTED, gorlix gotcha 5] |

### 3.6 Permissions (firmware 3.29.44+ / SDK 0.1.65+)

[CONFIRMED, official docs page `docs.supernote.com/en/plugin-base/permission`]

| Permission | Grants |
| --- | --- |
| `plugin.permission.FILE:READ` | Read the six shared folders: `Document`, `EXPORT`, `INBOX`, `MyStyle`, `Note`, `SCREENSHOT` |
| `plugin.permission.FILE:WRITE` | Write or modify those six folders |
| `plugin.permission.FILE:DELETE` | Delete in those six folders |
| `plugin.permission.INTERNET` | Any network request, from `sn-plugin-lib`, RN, Android or C++ |

- The plugin private directory (`PluginManager.getPluginDirPath()`, `.../files/plugins/<pluginID>`) needs no permission.
- Paths outside these scopes cannot be unlocked at all. `Download` cannot be granted [REPORTED, Pic2Note].
- `requestPermission(permission, desc?)` returns `1` allow once (expires when the plugin closes), `2` always allow, `0` denied, `-1` cancelled.
- After a denial, `requestPermission` only shows a prompt pointing to system settings.
- Error codes: `1500` not declared, `1501` write without `FILE:WRITE`, `1502` unsupported permission, `1503` read without `FILE:READ`, `1217` encrypted and locked path.
- Ratta's review rules say network use must be explained to users and must not bypass the permission mechanism [CONFIRMED, Ratta announcement].

### 3.7 Network behavior on device

- `fetch()` works for HTTPS on device [CONFIRMED on the owner's Manta, build 0.1.0 (1): Openclipart and Commons answered HTTP 200 with `plugin.permission.INTERNET` granted, [device-tests](device-tests.md)].
- **Cleartext HTTP is blocked.** PluginHost targets SDK 35 and declares no cleartext permission, so every `http://` request through `fetch` fails instantly with "Network request failed" on a Manta (Android 11) [REPORTED with source evidence, `LVEVAN/ink2task/plugin/src/utils/lanHttp.ts`]. This only matters for plain HTTP. Our sources are HTTPS, so this does not affect us [INFERENCE, high confidence].
- `fetch('file:///...')` works for reading local files but returns status `0`, so `response.ok` is false. Ignore the status and read the body [REPORTED, apclark31].

---

## 4. SDK API surface relevant to this plugin

All signatures below were read from `sn-plugin-lib@0.2.3` source (`src/`) [CONFIRMED]. Paths are inside the npm package.

### 4.1 `PluginManager` (`src/PluginManager.ts`, `src/module/NativePluginManager.ts`)

- `init()`: must be called at startup.
- `registerButton(type, appTypes, config)`: `type` 1 = sidebar/toolbar button, 2 = lasso toolbar button, 3 = document selection toolbar button. `appTypes` e.g. `['NOTE']`.
- Button config: `id`, `name`, `icon` (from `Image.resolveAssetSource(require(...)).uri`), `showType` (`0` headless, `1` full-screen RN UI), `editDataTypes` for lasso buttons: `0` handwritten strokes, `1` title, `2` image, `3` text, `4` link, `5` geometric shapes [CONFIRMED, `src/bean/PluginButton.ts`].
- `getPluginDirPath()`, `getPluginName()`, `getDeviceType()` (`5` = A5X2 Manta), `getOrientation()`.
- `showPluginView()`, `closePluginView()`.
- `hasPermission(permission)`, `requestPermission(permission, desc?)`.
- `registerPluginLifeListener(...)` (lifecycle events).

### 4.2 `FileUtils` (`src/module/NativeFileUtils.ts`, TurboModule `RTNFileUtils`)

Complete interface: `exists`, `getExternalDirPath`, `makeDir`, `getExportPath`, `renameToFile`, `copyFile`, `listFiles`, `getFileMD5`, `deleteFile`, `deleteDir`, `getFileList(suffixList)`, `getImageList`, `openFilePath`, `getStorageAvailableSpace`.

**There is no `writeFile` and no download method.** [CONFIRMED by reading the full interface, and REPORTED independently by apclark31 and SuperClaude: "Plugins cannot write files".] This single fact drives the native-code decision in section 6.

### 4.3 `FileSelector` (`src/module/NativeFileSelector.ts`)

- `selectImage(): Promise<string>`
- `selectFile(params)` with `selectType`, `suffixList`, `maxNum`, `title`, `rightButtonText`, `selectPathList`, `needSelectFolder`, `limitPath`.

### 4.4 `PluginNoteAPI` (`src/sdk/PluginNoteAPI.ts`)

- `insertImage(pngPath: string)`: inserts an image into the current layer of the current page. **Only png, jpg and jpeg are supported** (JSDoc in 0.2.3). **No position, size or layer parameter.** Host chooses the placement.
- `saveCurrentNote()`, `insertText(textBox)`, `getLassoText()`, link and title helpers.

### 4.5 `PluginCommAPI` (`src/sdk/PluginCommAPI.ts`)

- `getLassoElements()`, `getLassoElementTypeCounts()`, `getLassoRect()` returns `{left, top, right, bottom}`, `deleteLassoElements()`, `lassoElements(rect)`, `resizeLassoRect(rect)`.
- `setLassoBoxState(state)`: `0` show, `1` hide, `2` completely remove.
- `recognizeElements(elements, size)`: recognizes elements as text. **No language parameter.** Uses the device's active handwriting recognition language [CONFIRMED signature, behavior per language TO TEST]. With `size` set to the lasso rect size, every word failed with `117 Recognition failed` [CONFIRMED on the owner's Manta, build 0.1.0 (1)]. `LVEVAN/ink2task` and `j-raghavan/sn-dictionary` pass the note page size from `PluginFileAPI.getPageSize` [REPORTED, source read 2026-11-06]; build 0.1.0 (2) tests that.
- `cancelRecognize()`.
- `getCurrentFilePath()`, `getCurrentPageNum()`, `getPageDisplaySize()`, `reloadFile()`.
- `insertSticker(path)` (`.sticker` file), `saveStickerByLasso(path)` (strokes and geometries only), `convertElement2Sticker({machineType, elements, stickerPath})`.
- `insertPageElements`, `modifyPageElements`, `deletePageElements`, `batchUpdatePageElements`.

### 4.6 `PluginFileAPI` (`src/sdk/PluginFileAPI.ts`)

- `insertElements(notePath, page, elements)`, `getElements`, `replaceElements`, `modifyElements`, `deleteElements`.
- `getPageSize(notePath, page)`, `getLayers`, `insertLayer`, `createNote`, `generateNotePng`.
- Write APIs need an open note context. From the config/settings screen they return error `102` [REPORTED, apclark31].

### 4.7 Picture element (`src/model/Element.ts`)

- `Element.TYPE_PICTURE = 200`. One constant carries the comment "currently unused" [CONFIRMED].
- `Picture { picturePath: string, rect: {left, top, right, bottom} }`, rect in Android pixel coordinates, png/jpg/jpeg only [CONFIRMED].
- Pic2Note's docs say the current official Element table maps Picture to 200 and the bridge is exposed [REPORTED].
- Inserting a Picture element with an explicit `rect` through `insertElements` might allow precise placement. **Not verified by anyone we found** [TO TEST, section 9 spike S5].

### 4.8 Facts from other plugins' device testing [REPORTED, apclark31]

- Call `saveCurrentNote()` before `replaceElements()`. Call `reloadFile()` after file-level edits to refresh the display.
- Lasso context is ephemeral. It expires after navigation, and `deleteLassoElements()` returns `904` outside lasso context.
- `getLassoElements()` and `getElements()` return different UUIDs. Match by `numInPage`.
- All SDK calls are async and cross a process boundary. Cache page context (path, page number, size).

---

## 5. Image sources

### 5.1 Openclipart (primary for objects: soup, wine, beer, tree)

- License: everything is CC0 public domain [CONFIRMED, openclipart.org FAQ].
- **No usable public JSON API** [CONFIRMED by direct test on 2026-11-06]:
  - `https://openclipart.org/search/json/?query=soup&amount=3` returns `302` redirect to the home page.
  - `https://openclipart.org/api/search?query=soup` returns `401` "No authorization token was found" (express-jwt).
- **Server-rendered HTML search works** [CONFIRMED]:
  - Search page: `https://openclipart.org/search/?query=<term>` (HTTP 200).
  - Result links: `href="/detail/<id>/<slug>"`.
  - Thumbnails in the HTML: `src="/image/200px/<id>"`.
- **Image endpoint** [CONFIRMED]: `https://openclipart.org/image/<width>px/<id>`
  - `/image/200px/340609` returned `image/png`, 200 x 185, RGBA, 11,807 bytes.
  - `/image/800px/340609` returned `image/png`, 800 x 742, RGBA, 64,109 bytes.
  - Output is PNG **with alpha**. How alpha renders after `insertImage` is unknown [TO TEST].
- Risk: parsing HTML breaks if the site changes. Keep the parser isolated in one module with fixtures so a fix is one file.

### 5.2 Wikimedia Commons (primary for historical people, engravings)

- MediaWiki Action API: `https://commons.wikimedia.org/w/api.php`.
- Search files: `action=query&format=json&generator=search&gsrnamespace=6&gsrsearch=<term>&gsrlimit=<n>&prop=imageinfo&iiprop=url|mime|size|extmetadata&iiurlwidth=<w>`. `thumburl` in the response is the scaled image [CONFIRMED pattern via public implementations, response not observed by us].
- `gsrsearch` supports `filetype:bitmap` and `filetype:drawing` filters [INFERENCE from CirrusSearch keyword knowledge, TO TEST].
- **User-Agent policy is enforced.** Requests without a descriptive User-Agent with contact info may get 403 or 429 [CONFIRMED, mediawiki.org Instant Commons page]. In React Native, set the `User-Agent` header on `fetch` [TO TEST that RN on device honors it; build 0.1.0 (1) sent it and Commons answered HTTP 200 from the owner's network, but the header itself was not observed]. Use `Ink2Pic/<versionName> (+https://github.com/martonpaulo/ink2pic)`. The repository is public, so the link resolves and serves as the contact the policy asks for. Keep the README and an issue tracker enabled so Wikimedia operators have a way to reach the owner.
- Keep `gsrlimit` small (12 to 18, enough for two or three result pages) and cache results, to stay polite [DEFAULT].
- **Predefined thumbnail widths.** Since early 2026, Wikimedia image servers prefer predefined widths and strictly rate limit others. Steps: `20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840` [CONFIRMED, mediawiki.org]. Use only these for `iiurlwidth`.
- Licenses vary per file. Store `extmetadata.LicenseShortName` and attribution with each saved image.
- Our test from the cloud research machine got "You are making too many requests to the API" on the first call [CONFIRMED]. Shared cloud IPs are throttled. A home IP should be fine [INFERENCE].
- Thumbnails of JPG originals are JPG. `insertImage` accepts JPG, so no conversion is required for insertion [CONFIRMED from SDK JSDoc].

### 5.3 Rejected sources

| Source | Reason |
| --- | --- |
| Openverse API | Anonymous limit reported as 100 requests/day and 5/hour [REPORTED, mcp-openverse README]. Too low |
| Google Images | No keyless API, scraping is fragile and against terms |
| Pixabay / Unsplash / Pexels | Require API keys, photo-centric, poor fit for e-ink |
| Own proxy or Worker | Owner rejected any service |

---

## 6. Native code decision

### 6.1 The constraint

`insertImage` needs a file path. JS cannot write a file (section 4.2). Therefore the plugin needs some native code that writes bytes to disk, unless the host already exposes a writer.

### 6.2 Options, in the order to try

| Step | Option | Owner writes Java? | Toolchain |
| --- | --- | --- | --- |
| 1 | **Spike S0: probe host native modules.** A JS-only plugin lists `Object.keys(NativeModules)` and checks for any writer or download capability already loaded in PluginHost (for example an RNFS instance) | No | Node only |
| 2a | **Minimal Java module** (~40 lines): download URL to file, plus image preparation (section 7) | Yes, small | JDK + Android SDK platform 35 + build-tools 35.0.0, **no Gradle, no NDK** (section 6.3) |
| 2b | `react-native-fs` as a dependency | No | Full Gradle build via `buildCustomApkDebug`, Android SDK, NDK 27.x |
| 3 | Pure TS: decode image and convert to pen strokes (SuperClaude approach) | No | Node only, but output is line art, not an image |

Agreed position: **TypeScript everywhere. Java only for what JS cannot do.** Run S0 first because it might remove Java completely. If S0 finds nothing, prefer 2a, because image preparation (section 7) needs fast pixel work anyway and Hermes would be far slower for pixel loops [INFERENCE: Hermes in RN 0.79 interprets bytecode without a JIT].

Language decisions agreed:

- UI and flow: **TypeScript** (template ships `tsconfig`, SDK ships typings).
- Native: **Java**, not Kotlin. The Gradle-free pipeline compiles Java with `javac` + D8. Kotlin would likely require bundling the Kotlin stdlib [INFERENCE].
- No C/C++ (NDK cost, Android `BitmapFactory` already runs native code).
- Build and test scripts: Node.

### 6.3 Light native build without Gradle (reference: Pic2Note)

Source: `Keplex/supernote-pic2note` (MIT), files `native/BUILD.md`, `scripts/native-build.cjs` (76 lines), `scripts/build.cjs` (89 lines) [CONFIRMED by reading].

- Java module registered as a ReactPackage. PluginHost provides React Native and the SDK, so their classes are compile-only and not packaged.
- Prerequisites: JDK 17+, Android SDK Platform 35, Build Tools 35.0.0 (aapt2, D8), and `classes.jar` extracted from `react-android-0.79.2-release.aar` from Maven Central (verify SHA-1 against the `.sha1` file).
- Pipeline: `javac` (Java 8 bytecode) then D8 (min API 27) then aapt2, producing `app.npk` (an APK-format ZIP with a binary manifest and the module DEX, no launcher activity).
- `build.cjs` adds `nativeCodePackage: "/app.npk"` and `reactPackages: [...]` to the generated config and zips the package.
- Script mostly portable, with `.exe` handling for Windows [CONFIRMED]. Must be adapted to macOS paths.
- Both Maven Central and `dl.google.com` were reachable during research [CONFIRMED]. On 2026-11-06 Maven Central (`repo1.maven.org`, `repo.maven.apache.org`) answered HTTP 429 to the cloud IP; Google's mirror `maven-central.storage-download.googleapis.com` served the React Android AAR with the same SHA-1 file. `scripts/native-toolchain.sh` installs build-tools 35.0.0, platform 35 and that AAR into `.toolchain/`, each checked against a pinned SHA-1, and `scripts/native-build.cjs` runs this pipeline ([#11](https://github.com/martonpaulo/ink2pic/issues/11)).

### 6.4 Full Gradle path (fallback only)

- `buildPlugin.sh` scans `node_modules` for packages with Android `.java`/`.kt` sources (ignoring `react-native`, `react`, `sn-plugin-lib`, `@react-native*`, `@react-navigation*`) and for the project's own ReactPackages. If any exist, it runs `./gradlew buildCustomApkDebug`, copies the APK as `app.npk`, and writes `reactPackages`. Otherwise it **skips Gradle completely** [CONFIRMED by reading `buildPlugin.sh`].
- Template Android config: `compileSdk 35`, `buildToolsVersion 35.0.0`, `ndkVersion 27.1.12297006`, Kotlin 2.0.21 [CONFIRMED].
- gorlix lists JDK 19+, Android Studio, SDK Platform 35, Build-Tools 35 [REPORTED].
- If the project directory moves, clear `android/.gradle`, `android/app/build`, `android/build` [REPORTED].

### 6.5 Reference implementation of the download, write and insert flow

Inkling (`Laumss/Inkling`, SDK 0.2.3) does exactly this pattern with RNFS [CONFIRMED by reading `components/FormulaService.ts`]:

```ts
// Inkling, simplified
const STAGE_DIR = '/sdcard/EXPORT/lasso_ai';
if (!(await RNFS.exists(STAGE_DIR))) await RNFS.mkdir(STAGE_DIR);
await RNFS.writeFile(pngPath, base64Png, 'base64');
const ins = await PluginNoteAPI.insertImage(pngPath);
await sleep(400);
await PluginCommAPI.setLassoBoxState?.(2); // 2 = completely remove lasso box
```

Correction to an earlier claim in the conversation: Inkling calls `setLassoBoxState(2)`, which **removes** the lasso box. It does not activate a lasso around the inserted image. Whether the host leaves the inserted image selected is undocumented. Pic2Note's `docs/selection-handoff.md` notes there is no public "select after insert" parameter [REPORTED].

### 6.6 Where to write files

- Images passed to `insertImage` should live in **shared storage**, for example `MyStyle/<PluginName>/library/`, with `FILE:WRITE`. Pic2Note writes inserted exports to `MyStyle/LocalImage` and keeps only previews in the private dir. Inkling stages in `/sdcard/EXPORT/lasso_ai` [CONFIRMED by reading both].
- Whether the note app can read a file in the plugin private directory for `insertImage` is unknown [TO TEST]. Do not rely on it.
- Reconstructible state (the search cache, thumbnails) lives in the private directory (no permission). The library list (`library.json`, with recent searches) lives beside the pictures in `MyStyle/Ink2Pic/library/`, because installing a new version empties the private directory [CONFIRMED on build 0.1.0 (12), [#41](https://github.com/martonpaulo/ink2pic/issues/41)].

---

## 7. Image preparation for e-ink

Goal: the inserted image looks right on a 16-gray e-ink screen with no manual adjustment, and stays light.

Pipeline, per selected image, performed in native code while saving:

1. Download at the target size (do not download huge originals). Openclipart: pick the `/image/<w>px/` width. Commons: pick the closest predefined width.
2. Decode with bounds first (`inJustDecodeBounds`), then power-of-two `inSampleSize`, with a memory cap. Pic2Note does this with caps of 4 MP for previews, 16 MP for exports, 8192 px per edge [REPORTED, `docs/image-loading.md`].
3. Flatten transparency onto **white** (avoid dark or jagged edges from alpha) [TO TEST visually].
4. Convert to grayscale with a contrast curve suited to e-ink.
5. Optionally quantize to 16 gray levels [TO TEST whether it improves rendering or file size].
6. Encode PNG for line art. JPG may be smaller for engravings and photos [TO TEST].

Targets [INFERENCE, to calibrate on device]:

- Default inserted width about one third of the page width, about 600 to 700 px on a 1920 px wide Manta page, assuming the host maps image pixels to page pixels 1:1 [TO TEST].
- Roughly 50 to 150 KB per saved image.

Search-side quality: prefer results that render well in gray (line art, engravings, outlined clipart). Rank or filter accordingly. Show thumbnails converted to gray in the grid so the user sees the e-ink result before inserting [TO TEST cost].

---

## 8. UX specification (agreed)

### 8.1 Entry points

1. **Lasso toolbar button** (`registerButton(2, ['NOTE'], { editDataTypes: [0], showType: 1, ... })`): the main flow.
2. **Sidebar button** (`registerButton(1, ['NOTE'], { showType: 1, ... })`): opens the plugin on the Library tab or an empty search.

### 8.2 Main flow: handwriting as the query

1. User handwrites a word, e.g. "soup".
2. User lassoes it and taps the plugin button on the lasso toolbar.
3. Plugin calls `getLassoElements()` then `recognizeElements(elements, size)` and gets text.
4. The recognized text appears in an **editable field**, already submitted as a search. The user can fix a letter and search again.
5. Results appear in a grid.
6. One tap on a result: download, prepare, save to library, insert, close the plugin.

Target: **3 taps, no keyboard.**

Recognition language: `recognizeElements` has no language parameter. The device recognition language applies. With the owner's settings, five English test words were recognized exactly (build 0.1.0 (3)) [CONFIRMED]; another recognition language may still misread English words [TO TEST]. The editable field and recent-search buttons are the mitigation. Setting is under `Settings > Display & Input > Language` [INFERENCE on exact menu path].

### 8.3 Placement after insert

- Baseline [CONFIRMED API]: `insertImage(path)`, host default placement, the user moves it with the system lasso.
- Goal [TO TEST, spike S5]: place the image where the handwritten word was, using `getLassoRect()` for the position and a Picture element with `rect` via `insertElements`, then optionally delete the handwritten word with `deleteLassoElements()` (or by `numInPage` if the lasso context expired). This is the "magic" moment and the biggest differentiator. Only ship it if it works reliably. Otherwise keep the baseline.
- Capture `getLassoRect()` and the stroke identifiers **before** any navigation, because lasso context is ephemeral.
- Handwritten word after insertion: **kept** by default [DEFAULT]. Deleting it is enabled only after spike S5 proves rect placement works, and then becomes a single toggle remembered across sessions.

### 8.4 Results screen (e-ink rules)

- Pages of **6 large results** in a 2 x 3 grid, with ◀ ▶ buttons. **No scrolling**.
- No animations, no animated spinners. Static "Searching…" text.
- Black on white, thick borders, large touch targets.
- Render the grid once when all visible thumbnails are ready (or once per page), not image by image, to avoid repeated e-ink refreshes.
- Mixed list from both sources, ranked by e-ink suitability (line art and engravings first) [DEFAULT].

Layout metrics [DEFAULT, calibrate on device]:

The Manta screen is 1920 x 2560 px on a 10.7 inch diagonal, which is about 299 ppi, so 1 mm is about 11.8 px [CONFIRMED arithmetic from official specs]. React Native layout units in PluginHost are density-independent: `PixelRatio.get()` is 1.875 and `Dimensions.get('window')` is 1024 x 1365.33 [CONFIRMED on the owner's Manta, build 0.1.0 (1)]. So 1 mm is about 6.3 layout units; `src/ui/metrics.ts` converts with the runtime `PixelRatio`. The pixel column below stays in physical pixels.

| Element | Physical target | Pixels at 1:1 |
| --- | --- | --- |
| Minimum touch target | 10 mm | about 120 px |
| Primary buttons (◀ ▶, Search, tabs) | 12 to 14 mm tall | about 140 to 165 px |
| Grid tile (2 columns x 3 rows) | about 75 x 60 mm | about 880 x 720 px |
| Gap between tiles | 3 mm | about 35 px |
| Body text | about 3.5 mm cap height | font size near 40 px |
| Border width | 0.3 mm | 3 to 4 px |

### 8.5 Speed rules

- Grid thumbnails sized for the tile, not the full image: Openclipart `/image/400px/<id>`, Commons width `330` or `500` [DEFAULT]. `400px` works: HTTP 200, `image/png`, 24,197 bytes for id 340609 [CONFIRMED on the owner's Manta, build 0.1.0 (1)]. Full size only on tap.
- Query both sources **in parallel**, each with about a 5 s timeout. A slow source never blocks the other.
- Cache search results and thumbnails on disk. A repeated search opens instantly and works offline.
- Persist all state to files. Never depend on in-memory state between openings.
- Minimize SDK round trips. Cache note path, page number and page size per session.
- Keep the bundle small. Plain React Native components, no heavy UI libraries.

### 8.6 Library

- Every inserted image is saved automatically with metadata: source, source id or URL, query, license short name, attribution, date, file path, dimensions.
- **Library tab** works offline and is the fallback when there is no network.
- Recent searches shown as one-tap buttons.

### 8.7 Install and first run

- One `.snplg`, no keys, no account.
- Request permissions just in time but grouped on first real use, each with one plain sentence ("Internet to search images", "Files to save your image library"). Reference implementation: SuperTask `src/utils/permissions.js` and `PermissionsIntro.tsx` in `apclark31/supernote-plugin-research` [REPORTED].
- First open shows 3 short cards: write a word, lasso it, tap the button.
- `pluginID` fixed forever so updates keep the library.

### 8.8 Errors

- No network: "No internet. Showing your library."
- Source failed: show results from the other source and a small note.
- Permission denied: explain and point to `Settings > Apps > Plugins > <plugin> > Permissions`.
- Never fail silently.

### 8.9 No settings in the flow

Defaults are chosen so the user never needs to adjust. A minimal config screen (`registerConfigButton`) is optional and can come later.

### 8.10 User-facing copy

All strings live in one module, `src/ui/copy.ts`, never inline in components. English only. Short, plain, no jargon. Initial set [DEFAULT]:

| Key | Text |
| --- | --- |
| `button.lasso` | Find picture |
| `button.sidebar` | Ink2Pic |
| `tab.search` | Search |
| `tab.library` | Library |
| `search.placeholder` | Type or fix the word |
| `search.running` | Searching… |
| `search.empty` | No pictures found. Try a simpler English word. |
| `search.recent` | Recent |
| `nav.previous` / `nav.next` | ◀ / ▶ |
| `nav.previousLabel` / `nav.nextLabel` | Previous page / Next page |
| `insert.running` | Adding to your note… |
| `error.offline` | No internet. Showing your library. |
| `error.sourceDown` | One source did not answer. Showing the other one. |
| `error.permission.internet` | Ink2Pic needs internet access to search pictures. |
| `error.permission.files` | Ink2Pic needs file access to save pictures to your library. |
| `error.permission.settings` | To allow it, open Settings > Apps > Plugins > Ink2Pic > Permissions. |
| `error.recognition` | Could not read the word. Type it instead. |
| `error.emptyLasso` | There is no handwriting in the lasso. Type the word instead. |
| `error.sourcesDown` | The picture sources did not answer. Try again in a minute. |
| `error.downloadOffline` | The internet stopped while getting the picture. Try again when you are online. |
| `error.download` | Could not get this picture. Try another one. |
| `error.save` | Could not save the picture. Free some space on the device and try again. |
| `error.place` | Could not put the picture in the note. Open a note page and try again. |
| `error.unexpected` | Something went wrong. Open Log for details. |
| `onboarding.1` | Write a word in your note. |
| `onboarding.2` | Circle it with the lasso. |
| `onboarding.3` | Tap Find picture and choose one. |
| `onboarding.start` | Start |

Permission request descriptions (`requestPermission(permission, desc)`) reuse the `error.permission.*` texts.

Every failure shows one of these sentences, never a code; the log keeps the detail. One module,
`src/flow/failure.ts`, maps a failure (its step, code and message) to its keys; a missing
permission (error 1503, or `EACCES` from the file module) shows its `error.permission.*` text
followed by `error.permission.settings` ([#37](https://github.com/martonpaulo/ink2pic/issues/37)).

---

## 9. Implementation plan

### 9.1 Spikes (do these first, each answers one unknown on the owner's device)

| Spike | Question | Build type | Pass criteria |
| --- | --- | --- | --- |
| **S0** | Does PluginHost already expose a native module that can write files or download? What are the layout density and window size? | JS only | List `Object.keys(NativeModules)` and, for promising modules, their method names. Log `PixelRatio.get()`, `Dimensions.get('window')`, `PluginManager.getDeviceType()`. Write everything as a text box with `insertText` so one screenshot carries the result |
| **S1** | Does HTTPS `fetch` from the plugin reach Openclipart and Commons on the owner's Manta, with `INTERNET` declared and granted? Is the User-Agent header honored? | JS only | Both return HTTP 200 and parseable content |
| **S2** | Download + write + `insertImage` works on 3.31.45, from `MyStyle/<plugin>/`. How does PNG alpha render? | Native (Java, light build) or RNFS | Image appears in the note. Note the default placement and size |
| **S3** | Does `recognizeElements` return correct English words with the owner's recognition language? | JS only | "soup", "wine", "beer", "tree", "Napoleon" recognized |
| **S4** | Does the host map image pixels 1:1 to page size? What width gives about one third of the page? | Reuse S2 | Document measured result |
| **S5** | Can a Picture element (type 200) with `rect` be inserted at the lasso position via `insertElements`? | Reuse S2 | Image appears at the requested rect |

S0, S1 and S3 can share one JS-only test plugin. Every spike result must be written back into this document.

Results so far ([device-tests](device-tests.md)):

- S1 passed on build 0.1.0 (1) [CONFIRMED].
- S0 answered on build 0.1.0 (2): `Object.keys(NativeModules)` returns no keys in PluginHost, but each module is found by name. The host has no module that writes bytes to a file or downloads to a file: `RTNFileUtils` only copies, renames, lists and deletes, and no RNFS-like module is loaded [CONFIRMED]. So the plugin needs the small Java module (section 6.2, option 2a), [#11](https://github.com/martonpaulo/ink2pic/issues/11).
- S3 passed on build 0.1.0 (3): with `size` set to the page size from `getPageSize` (1920 x 2560), `recognizeElements` returned "soup", "wine", "beer", "tree" and "Napoleon" exactly, in 0.55 to 0.97 s, with the owner's recognition language [CONFIRMED]. Builds 1 and 2 failed first: the lasso size gives `117`, and `getPageSize` needs `plugin.permission.FILE:READ` declared and granted, else `1503` [CONFIRMED].

Decision tree after the spikes:

```
S0 finds a usable writer/downloader?
├─ yes → no native code. Image preparation (section 7) is reduced to what the source can deliver
│        (right-sized thumbnails). Gray conversion is skipped or done later.
└─ no  → native Java module with the light build (section 6.3), unless the owner chooses RNFS (6.2, 2b)
S1 fails for HTTPS?
└─ stop and report. The architecture depends on on-device HTTPS.
S3 recognition poor?
└─ keep the flow, make the editable field prominent, rely on recent searches.
S5 fails?
└─ keep insertImage with host placement. Do not ship word deletion.
```

### 9.2 Phases and estimates

Estimates assume focused work with an agent writing most code. They are rough because the slow part is the device test cycle (build, copy, install, restart for native changes).

| Phase | Deliverable | Estimate |
| --- | --- | --- |
| 0 | Spikes S0 to S3, toolchain in the cloud session or on the Mac | 3 to 5 h |
| 1 | MVP: lasso to recognized text, Openclipart search, grid, tap to insert, file saved | 8 to 12 h |
| 2 | Library tab, recent searches, offline fallback, cache | 5 to 8 h |
| 3 | Commons source, licenses, e-ink image preparation pipeline | 6 to 10 h |
| 4 | Polish: onboarding cards, permission intro, errors, placement experiment S5 | 4 to 8 h |
| **Total** | | **about 25 to 40 h** |

Calendar [INFERENCE]: at about 2 hours a day, the MVP in about one week and the full plugin in two to three weeks. The owner's own time is mostly device test cycles, estimated at 15 to 30 cycles of 5 to 10 minutes each.

### 9.3 Suggested project layout

```
ink2pic/
  PluginConfig.json          # pluginID fixed after first build, uses-permissions declared
  index.js                   # init, registerButton (lasso + sidebar)
  App.tsx                    # screen router
  src/
    sdk/                     # thin typed wrappers over sn-plugin-lib calls, one place for error handling
    sources/
      openclipart.ts         # HTML parse + URL builders, fixtures in tests
      commons.ts             # Action API client, predefined widths, User-Agent
      types.ts               # SearchResult { id, source, thumbUrl, fullUrl(width), license, attribution }
    search/                  # parallel search, timeouts, ranking for e-ink
    library/                 # metadata index, recent searches
    storage/                 # paths, cache, persistence via native module
    ui/                      # Results grid (6 per page), Library, Onboarding, Errors
    log/                     # on-device rotating log file
  native/                    # only if S0 fails
    src/<package>/ImageFetchPackage.java
    src/<package>/ImageFetchModule.java   # downloadToFile, prepareForEink, writeText, readText
  scripts/
    native-build.cjs         # adapted from Pic2Note (MIT), macOS paths
    build.cjs
  tests/
```

### 9.4 Native module contract (only if S0 fails) [design, not implemented]

```ts
interface ImageFetchModule {
  // Downloads url to destPath. Returns bytes written. HTTPS only.
  downloadToFile(url: string, destPath: string, headers: Record<string, string>): Promise<number>;
  // Decodes srcPath with a memory budget, flattens alpha on white, converts to gray,
  // applies contrast, scales to targetWidth, writes PNG or JPG to destPath.
  prepareForEink(srcPath: string, destPath: string, targetWidth: number, format: 'png' | 'jpg'): Promise<{ width: number; height: number; bytes: number }>;
  // Small text persistence for cache and library index, since FileUtils has no writeFile.
  writeText(path: string, text: string): Promise<void>;
  readText(path: string): Promise<string>;
}
```

Implementation notes [INFERENCE]: `HttpURLConnection` (HTTPS is allowed, cleartext is not), `BitmapFactory` with bounds-first decoding, `Bitmap.compress`. Reading text can also use `fetch('file://...')` and ignore status `0` [REPORTED]. Respect the permission model: write only inside the six shared folders with `FILE:WRITE` granted, or inside the private plugin dir.

### 9.5 Definition of done for the MVP

- Installs from one `.snplg` on Chauvet 3.31.45 with `sn-plugin-lib` 0.2.3.
- Lasso a handwritten English word, tap, see results, tap one, image is in the note, plugin closed.
- Works offline for previously saved images.
- No crash or silent failure when the network or a source is down.
- Every [TO TEST] item touched by the MVP has a recorded result in this document.

---

## 10. Engineering practices

### 10.1 Owner conventions

- U.S. English for code, identifiers, comments, docs and commits.
- Search before editing, read the smallest useful code region, cite exact file paths.
- Prefer native platform capabilities and maintained packages before custom infrastructure.
- Keep expensive work out of render paths. Consolidate repeated behavior in one place.
- Validate with the project's real build and tests.
- Final reports state what changed, what was validated, what remains uncertain, and residual risk.

### 10.2 Device test cycle

1. Bump `versionCode`.
2. `./buildPlugin.sh` (JS only) or the native build script.
3. Copy `.snplg` to `MyStyle/` (USB, Browse & Access, Supernote Partner, or Cloud).
4. `Settings > Apps > Plugins > Add Plugin`, pick the new file (beware the managed-copy gotcha in 3.4).
5. Restart the device after native changes.
6. Open a note and test.

### 10.3 Logging

- Append every log entry to a rotating file, e.g. `MyStyle/<Plugin>/logs/session.log`, flushed on events, never on timers [REPORTED pattern, SuperTask].
- Fallback: insert logs as a text box with `insertText` on a scratch page.
- Log every boundary: permission results, SDK calls with `success` and `error.code`, network status codes, file paths.

### 10.4 Tooling notes

- `firestormkirby/sn-plugin-ui-preview` runs a plugin's RN panel in a browser for UI iteration without the device [REPORTED, not evaluated].
- `gorlix/supernote-plugin-dev` is an agent skill for sn-plugin-lib development with gotchas and API quick reference [REPORTED, read in full at `41fa3ad` on 2026-11-06; section 10.5].
- `apclark31/supernote-plugin-research` has extracted official docs, SDK notes and device-tested patterns [REPORTED, `CLAUDE.md` read in full].

---

### 10.5 Known platform gotchas: read them before an SDK call

Three device rounds on 2026-11-06 failed on problems other developers had already recorded. The
reference `gorlix/supernote-plugin-dev` (MIT, `SKILL.md` «Common Gotchas» and
`references/patterns.md`, read at `41fa3ad`) and the official docs at `docs.supernote.com`
(`llms.txt` lists every page; reachable from the cloud environment since 2026-11-06) are read
before writing or changing an `sn-plugin-lib` call, and before fixing a device failure
(AGENTS.md).

| What failed on the Manta | Build | Already recorded as |
| --- | --- | --- |
| `recognizeElements` error 117 with the lasso size | 0.1.0 (1) | gorlix gotcha 25: pass `getPageSize`, never the lasso rect |
| `getPageSize` error 1503 | 0.1.0 (2) | gorlix gotcha 38 and pattern 17: declare and request `FILE:READ` first |
| The view stayed on its waiting text after opening | 0.1.0 (1), (4), (6) | gorlix gotcha 11 and pattern 5: the button event can fire before a listener registered in `App.tsx`; store a pending button id in `index.js`; pattern 9: reset the view on close with `registerPluginLifeListener` |
| A native module is invisible unless listed | 0.1.0 (4) | gorlix gotcha 33: only `reactPackages` in `PluginConfig.json` loads it |
| The view closed at once, with no trace | 0.1.0 (9) | `j-raghavan/sn-dictionary` notes: an `RTNFileUtils` call can throw inside the host, past JS, and the host closes the plugin [REPORTED]; Ink2Pic reaches files only through its own module, and a test keeps `FileUtils` out of product code |
| Permission granted but read as missing | 0.1.0 (10) | sn-plugin-lib 0.2.3 source ([#34](https://github.com/martonpaulo/ink2pic/issues/34)) [CONFIRMED in code]: `requestPermission` settles only when the host answers, with no timeout, so a 20 s call limit failed it while the dialog waited; `hasPermission` may answer 2 (always) as well as 1. Ink2Pic waits for a dialog with no limit and counts 1 and 2 as granted |
| `getExternalDirPath` can close the plugin | 0.1.0 (9) | sn-plugin-lib 0.2.3 source ([#34](https://github.com/martonpaulo/ink2pic/issues/34)) [CONFIRMED in code]: it reads the current activity with no null check, so its error never reaches JS; `listFiles` returns `{path,type}` objects, `null` for an empty folder |
| Logs | all | gorlix gotcha 40: `console.log` is not stripped in a real build; `adb logcat -s ReactNativeJS` reads it when a cable is available |

What the PluginHost itself does, read from the Manta firmware 3.31.45 APK on 2026-11-06
([#34](https://github.com/martonpaulo/ink2pic/issues/34), step 3; behaviour only, no Ratta
code). Each item is CONFIRMED in the host's code until a device test shows otherwise; the one
INFERENCE is marked.

- A `RuntimeException` thrown in a native module destroys the plugin: lifecycle 4 then 5, never
  3, with no retry and no message. `getCurrentActivity()` is always null: the host resumes React
  with no activity, so an SDK native method that dereferences it throws and the plugin dies.
- The host closes a view that shows nothing: about 5 s after show it looks for one visible,
  non-transparent child of non-zero size, re-checks 3 s later, then closes (lifecycle 3). Render
  an opaque, sized view at once.
- The host accepts SDK versions 0.1.62 to 0.3.1 and assumes 0.1.60 until the SDK reports one.
  The SDK's `init()` reports the version only after `onMounted`, so a button press replayed on
  mount can be rejected with a «plugin run failed» dialog and the view closes from lifecycle 1
  without reaching 2 [INFERENCE that builds (8) and (9) hit this].
- `plugin_button_event` and lifecycle 2 always arrive as a pair, in that order; lifecycle 1 comes
  from the SDK's `onMounted`. Hiding because the Note app paused or the file changed sends no
  lifecycle event at all: the plugin still believes it is at 2.
- A pending `requestPermission` resolves to -1 when the container hides or the plugin is
  destroyed. A request made while the view is hidden and the plugin has buttons is parked and
  answered only on the next press or show.
- `insertImage(path)` ignores the lasso: the Note app centres the bitmap on the screen as a
  floating selection, at least 100 px and at most 2560 px per side. `createElement(200)` plus
  `insertElements` places the picture at the plugin's `picture.rect`, read as Android pixel
  coordinates, with no clamping to the page.

## 11. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Native module does not load on 3.31.45 | Blocks image writing | Spike S2 early. Fall back to RNFS via Gradle, or to stroke tracing |
| Openclipart HTML changes | Source breaks | Isolated parser with fixtures, Commons still works |
| Commons throttling | Slow or failed searches | Descriptive User-Agent, predefined widths, caching, small `gsrlimit` |
| Recognition misreads English | Wrong query | Editable field, recent searches |
| `insertImage` placement or scale unsuitable | Manual adjustment needed | Pre-size the image, spike S5 for rect placement |
| Alpha renders badly | Ugly edges | Flatten on white in native prep |
| Future firmware breaks the SDK contract | Plugin stops working | Pin SDK, track Ratta announcements, rebuild on new `sn-plugin-lib` |
| Undocumented SDK behavior relied on | Breaks silently | Keep such code behind one wrapper, log results |

---

## 12. Decisions taken by default

These were open questions. Defaults let work start. The owner may override any of them, and the agent updates this table when that happens.

| Topic | Default | Alternatives |
| --- | --- | --- |
| Name | `Ink2Pic` [DEFAULT] | `Word2Pic`, `SuperPic`, `sn-picture` (section 12.1) |
| Handwritten word after insert | Kept. Deletion toggle only after S5 succeeds | Delete always, ask once |
| Devices | Manta (A5 X2) only | Nomad later (same firmware line, different page size) |
| Distribution | Public: after the MVP, Ratta's review for InkHub, the `fharper/awesome-supernote` list and posts on r/Supernote_dev and r/Supernote (owner decision D3 A, 2026-11-06; [research](research/2026-11-distribution-channels.md), [#28](https://github.com/martonpaulo/ink2pic/issues/28), [#29](https://github.com/martonpaulo/ink2pic/issues/29), [#30](https://github.com/martonpaulo/ink2pic/issues/30)) | GitHub only; personal use |
| License | MIT (required in practice now that the repository is public) | None. A public repository without a license gives no reuse rights |
| User-Agent contact | Repository URL | Owner's e-mail if Wikimedia throttles |
| UI language | English only (requirement, not a default) | None |

### 12.1 Naming research

Community plugins follow three patterns [CONFIRMED from the GitHub search of Supernote plugins on 2026-11-06]:

| Pattern | Examples |
| --- | --- |
| `X2Y` (input to output) | `Ink2Task`, `Pic2Note` |
| `Super*` | `SuperTask`, `SuperDashboard`, `SuperFun`, `SuperStickyNote`, `SuperClaude`, `SuperTemplate` |
| `sn-*` repository prefix | `sn-shapes`, `sn-canvas`, `sn-clipper`, `sn-dictionary`, `sn-weather`, `sn-frameclip` |

Ratta's own apps use `Ink*` (`InkFlow`, `InkHub`). `Ink2Pic` combines the `X2Y` pattern with the `Ink` family and describes the flow exactly: handwriting in, picture out. A GitHub search found no Supernote project with any of the candidate names. An unrelated repository `Shibu0div/ink2pic` exists [CONFIRMED].

---

## 13. History of options considered and rejected

Kept so the agent does not re-propose them.

| Option | Why rejected |
| --- | --- |
| Native image insert in Supernote without plugins | Does not exist. Images can only be a page template background (full page, not movable) |
| Hidden WebView browser + screenshot + template | Works but manual, full-page only |
| Existing "Insert Image" plugin (wolfsolver) | Broken on 3.31.45 ([issue 16](https://github.com/wolfsolver/supernote-image-insert-plugin/issues/16), no maintainer reply) |
| Embed PNG plugin (jpmoo) | Local files only, SDK 0.1.43, no search |
| Pic2Note / Local Image (Keplex) | Local files only, no search. Used as the reference for native build and image decoding |
| Inkling + LocalSend | Requires sending from another device |
| SuperClaude | Draws strokes via the Anthropic API with a paid key. Not an image inserter |
| Sticker converter workflow (`j-raghavan/supernote-stickers`) | Works (owner tested), but needs phone or computer and a manual Import tap per pack |
| iOS Share Extension or Shortcut + Mac watcher + unofficial Supernote Cloud API | Needs phone, Mac and an unofficial API. Owner wants everything on the device |
| Own proxy or Worker | Owner does not want any service |
| Wikidata query translation | Dropped once English became a requirement |
| Kotlin or C++ for native code | Java fits the Gradle-free build. NDK not needed |

---

## 14. Sources

Official:

- Supernote plugin docs: `https://docs.supernote.com/en/first-plugin`, `https://docs.supernote.com/en/plugin-base/permission`, API reference pages for `insertImage`, `insertSticker`, `saveStickerByLasso`, `convertElement2Sticker`, `generateNoteTemplatePng`
- SDK source: npm `sn-plugin-lib@0.2.3` (`src/sdk/*.ts`, `src/module/*.ts`, `src/model/Element.ts`, `src/bean/PluginButton.ts`)
- Template: npm `@supernote-plugin/sn-plugin-template@1.0.13` (`buildPlugin.sh`, `android/build.gradle`)
- Manta and Nomad changelog: `https://support.supernote.com/changelog-for-manta-and-nomad`
- Custom template requirements (Manta 1920 x 2560): `https://support.supernote.com/faq/how-to-create-a-custom-note-template`
- Ratta plugin announcements and review rules: r/Supernote_dev (3.29.44 beta announcement, "Plugin Review Process & Publishing Requirements")
- Wikimedia: `https://www.mediawiki.org/wiki/Instant_Commons` (User-Agent policy, predefined thumbnail widths)
- Openclipart FAQ: `https://openclipart.org/faq`

Community code read during research (shallow clones, 2026-11-06):

- `Keplex/supernote-pic2note` and `Keplex/supernote-localimage` (MIT): Gradle-free native build, image decoding, insert paths
- `Laumss/Inkling`: RNFS write + `insertImage`, Picture elements to stickers
- `LVEVAN/ink2task`: cleartext HTTP block analysis, native socket workaround
- `eternauta1337/superclaude`: SDK 0.2.3 on firmware 3.30+, no file write, stroke-based drawing
- `apclark31/supernote-plugin-research`: SDK notes and device-tested patterns
- `gorlix/supernote-plugin-dev`: build, install and debugging gotchas
- `wolfsolver/supernote-image-insert-plugin`: broken on 3.31.45, [issue 16](https://github.com/wolfsolver/supernote-image-insert-plugin/issues/16)
- `jpmoo/embedimage`, `Sparkinman/web-lookup-supernote-plugin`, `Taoist22-Supernote/sn-frameclip`, `Ziv-Ink/supernote-plugin-template`, `j-raghavan/supernote-stickers`

Research method: primary sources first, source code over descriptions, cross-checks, and explicit separation of confirmed facts, reports, inferences and open items, following the owner's `skd-external-research` skill.

---

## 15. Research log

What was actually executed during research, so the agent knows what is proven:

- Downloaded and read `sn-plugin-lib@0.2.3` from npm.
- Scaffolded a project with `npx @react-native-community/cli init ImageSpike --template @supernote-plugin/sn-plugin-template --version 0.79.2`. This succeeded and revealed the `^0.1.19` pin.
- **Running `buildPlugin.sh` was not possible** in the research sandbox: the session's safety policy blocked executing the downloaded build script. Build behavior in this document comes from reading the script, not from running it. The first build must happen on the owner's Mac or in an environment where the owner approves it.
- Tested Openclipart search page, JSON endpoints and image endpoints with `curl` (results in 5.1).
- Tested one Wikimedia Commons API call from a cloud IP (throttled, result in 5.2).
- Confirmed reachability of `dl.google.com` and Maven Central from the research machine.
- No code was run on a Supernote device. Every on-device behavior is either REPORTED by others or TO TEST.
- Searched GitHub repositories for candidate names (`Ink2Pic`, `Word2Pic`, `SuperPic`, `SuperImage`, `InkPic`, `sn-picture`, `sn-image`). None collides with a Supernote project.
- 2026-11-06, first cloud backlog run: `bash buildPlugin.sh` ran in the cloud and built `Ink2Pic.snplg` (JS only, no Gradle) [CONFIRMED]. Once a root `PluginConfig.json` exists the script copies it unchanged: it does **not** copy `versionName` from `package.json`, so a test keeps the two equal [CONFIRMED by reading and running]. `pluginID` `23c48qc2qvw7rwb6` was generated once, with the script's own method, and committed ([#3](https://github.com/martonpaulo/ink2pic/issues/3)).
- Confirmed in the cloud machine: Java and javac installed, Node 22 installed, outbound HTTPS to npm, GitHub, Openclipart, `dl.google.com` and Maven Central.

---

## 16. Development environment and delivery

### 16.1 Where each part runs

The owner prefers working without the local Mac when possible. Most work can run in a Claude cloud session [CONFIRMED capabilities observed during research, except where marked].

| Work | Cloud session | Notes |
| --- | --- | --- |
| All TypeScript code | Yes | |
| Unit tests (Jest, already in the template) | Yes | |
| Openclipart parser tests against live pages | Yes | Openclipart was reachable from the cloud machine [CONFIRMED] |
| Commons client tests | Fixtures only | The Commons API throttled the cloud IP on the first call [CONFIRMED]. Record real responses once from the device or the owner's network, then test against fixtures |
| Java code and JVM tests for pixel logic | Yes | Java and javac are installed in the cloud machine [CONFIRMED]. Pic2Note tests its pixel engine the same way |
| Android SDK platform 35, build-tools 35, `react-android` AAR | Yes | `dl.google.com` and Maven Central were reachable [CONFIRMED] |
| Building the `.snplg` | Yes | `buildPlugin.sh` ran in the cloud session of 2026-11-06 and produced `build/outputs/Ink2Pic.snplg` for a JS-only build [CONFIRMED]. The owner allows it without asking (AGENTS.md) |
| UI preview in a browser | Possible | `firestormkirby/sn-plugin-ui-preview` [REPORTED, not evaluated] |
| Install and test on the Manta | **No, owner only** | Section 18 |

Cloud sessions keep files between turns but stop background processes a few minutes after a reply. Commit and push often so nothing depends on the sandbox surviving.

### 16.2 Fallback: build on the owner's Mac

If the cloud build stays blocked:

- JS-only builds need Node 18+ and `zip` [CONFIRMED from `buildPlugin.sh` requirements].
- Native builds with the light pipeline need JDK 17+, Android SDK platform 35 and build-tools 35.0.0, and the extracted `react-android` 0.79.2 `classes.jar` (section 6.3).
- Avoid the full Gradle path on the owner's low-memory Mac unless the RNFS route (option 2b) is chosen.

### 16.3 Delivering a build to the owner

1. The agent builds `build/outputs/Ink2Pic.snplg` and sends it to the owner in the chat (or attaches it to a GitHub release in the repository).
2. The owner saves it on the iPhone.
3. The owner uploads it to the Manta `MyStyle/` folder with the Supernote Partner app (or USB, Browse & Access, Supernote Cloud).
4. The owner installs it with `Settings > Apps > Plugins > Add Plugin`, picking the new file, and restarts the device after native changes.

Every build sent to the owner has a higher `versionCode` and a `versionName` that matches a git tag or commit, so a test report always maps to exact code.

---

## 17. Repository and conventions

### 17.1 Repository

| Item | Value |
| --- | --- |
| Repository | `martonpaulo/ink2pic`, **public** (owner decision). Name `ink2pic` is still [DEFAULT] |
| Branch | Work on `main`. Do not create or switch branches unless the owner asks |
| Commits | Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`), U.S. English. Commit only files that belong to the change |
| This brief | Lives in the repository as `docs/brief.md` and is updated in the same commit as any decision or test result |
| Device test reports | `docs/device-tests.md`, one entry per build (section 18.3) |
| Notices | `NOTICE.md` for any reused code, for example Pic2Note's MIT build script |
| Public hygiene | No secrets, tokens, personal data, device serial numbers or private logs in commits. Device test screenshots go in the repository only after checking they show nothing personal. `.gitignore` covers `build/`, `node_modules/`, `android/.gradle`, local toolchains and logs |
| README | Short English README: what Ink2Pic does, install steps (section 16.3), permissions it asks for and why, image sources and their licenses |

### 17.2 Bootstrap commands

```bash
npx @react-native-community/cli init Ink2Pic \
  --template @supernote-plugin/sn-plugin-template \
  --version 0.79.2
cd Ink2Pic
npm install sn-plugin-lib@0.2.3 --save-exact
```

The `init` command was run successfully during research with the name `ImageSpike` [CONFIRMED]. Then:

- Remove the template's three demo buttons from `index.js` and register only the lasso and sidebar buttons (section 8.1).
- Delete the generated `ios/` folder if it is unused. PluginHost is Android only [INFERENCE].
- Write `PluginConfig.json` by hand before the first build, with the fields in section 3.5 and the `uses-permissions` list below, so the generated `pluginID` is created once and committed.

```json
"uses-permissions": [
  "plugin.permission.INTERNET",
  "plugin.permission.FILE:READ",
  "plugin.permission.FILE:WRITE"
]
```

`FILE:DELETE` is added only if the library gets a delete action.

### 17.3 Quality gates

- TypeScript `strict` mode. `tsc --noEmit` passes.
- ESLint from the template passes.
- Jest unit tests for every module in `src/sources`, `src/search`, `src/library` and `src/storage`. Network is mocked. Fixtures are real captured responses.
- Capture fixtures before writing parsers: save at least two real Openclipart search pages (one with many results, one with none) and two Commons API responses.
- JVM tests for the native image pipeline if it exists.
- A build that produces an installable `.snplg` is the final gate. Unit tests cannot prove device behavior.
- Keep SDK calls behind the wrappers in `src/sdk` so tests can mock them and undocumented behavior stays in one place.

---

## 18. Device test protocol

The agent cannot reach the Manta. The owner runs every device test, so each test must be quick and its result unambiguous.

### 18.1 What the agent sends with each build

- The `.snplg` file.
- A numbered checklist of at most 8 steps, each with the expected result.
- What to send back for each step.

### 18.2 What the owner sends back

- Pass or fail per step.
- A screenshot for any visual step (`Swipe down > Screenshot`, saved in `SCREENSHOT/`), sent through the Supernote Partner app or Cloud.
- The plugin log file (`MyStyle/Ink2Pic/logs/session.log`) when something fails.

For spikes, the plugin also writes its findings as a text box on the current page with `insertText`, so a single screenshot carries the whole result.

### 18.3 Recording

Each report is added to `docs/device-tests.md`:

```markdown
## Build <versionName> (<versionCode>), <date>, firmware 3.31.45
| Step | Expected | Result | Notes |
```

Then the matching [TO TEST] items in this brief are updated to [CONFIRMED] or to a recorded failure.
