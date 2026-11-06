# What PluginHost does: the SDK and other plugins

Research for [#34](https://github.com/martonpaulo/ink2pic/issues/34).

Date: 2026-11-06. Read-only. No Ratta code is copied here; these notes describe behavior and
point to file and line.

Question: which errors, hangs and events of the PluginHost explain builds 8 to 10 (host held
lifecycle 1, then closed the view; `requestPermission(INTERNET)` did not answer in 20 s)?
Target: `sn-plugin-lib` 0.2.3 as installed in `node_modules/sn-plugin-lib` (JS and Java ship as
source, so the source was read directly), plus three public plugins' sources.

Tags: CONFIRMED = read in code. REPORTED = written by another plugin author. INFERENCE = reasoned,
not observed. UNKNOWN = not established.

Paths below are relative to `node_modules/sn-plugin-lib/`. `J/` = `android/src/main/java/com/ratta/supernote/pluginlib/`.

The firmware part (step 3) ran on the owner's Mac; its findings are in [a comment on issue 34](https://github.com/martonpaulo/ink2pic/issues/34#issuecomment-6694734043) and in brief section 10.5.

## Contents

- [Main finding: the plugin library is only a thin client](#main-finding-the-plugin-library-is-only-a-thin-client)
- [(a) requestPermission: values, and can it hang](#a-requestpermission-values-and-can-it-hang)
- [(b) hasPermission](#b-haspermission)
- [(c) RTNFileUtils errors, and can a native exception kill the plugin](#c-rtnfileutils-errors-and-can-a-native-exception-kill-the-plugin)
- [(d) Button event and lifecycle](#d-button-event-and-lifecycle)
- [(e) Native modules and methods the JS calls](#e-native-modules-and-methods-the-js-calls)
- [Other plugins (step 2)](#other-plugins-step-2)
- [Firmware (step 3)](#firmware-step-3)
- [Commands run](#commands-run)

## Main finding: the plugin library is only a thin client

- CONFIRMED. `J/api/HostCommonAPI.java` (line 26), `J/core/PluginAppAPI.java`,
  `J/error/PluginJSExceptionHandler.java` and `HostUIAPI` are **abstract**. Their implementations
  live in the PluginHost APK, not in the SDK. So permission dialogs, permission checks (FILE:READ
  for `getPageSize` and the like), lifecycle emission, button dispatch, and what happens on an
  exception are all decided by the host.
- CONFIRMED. `android/libs/plugincommonlib.aar` holds only data beans, enums, AIDL parcelables and
  `PluginException` (inspected with `unzip -l` and `javap`). No logic.
- CONFIRMED. The only `.so` (`android/src/main/cpp/FileVisit.cpp`, `native-lib.cpp`) ships as
  source: a recursive file walk for `getFileList` / `getImageList`; `opendir` failure returns early
  (`FileVisit.cpp` line 72). No exception thrown.
- Ghidra was not needed: no native binary that needs pseudocode was obtained (no `app.npk`, no
  firmware). Installing it was skipped, per the skill's "install only when such a binary appears".

## (a) requestPermission: values, and can it hang

- CONFIRMED values: -1 = cancelled without a choice (not recorded as deny; three-option dialog
  shows again next time), 0 = Don't allow, 1 = Allow this time only, 2 = Always allow.
  `src/PluginManager.ts` lines 621-656 (JSDoc), `J/callback/PermissionRequestCallback.java`.
- CONFIRMED `desc` is shown only in the "previously denied, go to Settings" prompt, not in the
  first three-option dialog (`src/PluginManager.ts` lines 628-632; `J/api/HostCommonAPI.java`
  lines 488-498). JS must pass `null` explicitly when omitted (line 653-655).
- CONFIRMED the promise settles only when the host calls `onResult` or `onError`
  (`J/modules/PluginModule.java` lines 248-268). There is **no timeout** in the SDK, JS or Java.
  It rejects at once only when `pluginApp` or `HostCommonAPI` is null (lines 250-256).
- INFERENCE: the promise stays pending for as long as the dialog is open, so the build-10 "no
  answer in 20 s" is the user not having chosen yet, not a lost callback. A 20 s watchdog will
  misreport a slow user as a hang. Whether the host ever drops the callback (for example when the
  view closes with the dialog open) is UNKNOWN.

## (b) hasPermission

- CONFIRMED it is synchronous on the Java side: it calls the host's `hasPermission` and resolves
  the int, or rejects with the host's `PluginException` (`J/modules/PluginModule.java` lines
  222-237).
- Conflict, CONFIRMED in code: the JS JSDoc says 0 = not granted, 1 = granted
  (`src/PluginManager.ts` line 605); the Java abstract method says 0 = not granted, 1 = this time
  only, 2 = always (`J/api/HostCommonAPI.java` line 483). Treat 1 and 2 as granted.
- REPORTED: web-lookup plugin treats 1 and 2 as granted and says "Allow this time only" is revoked
  when the plugin exits, so it re-asks every launch (`src/permissions.ts` lines 15-43, commit
  e841123).

## (c) RTNFileUtils errors, and can a native exception kill the plugin

Module `RTNFileUtils` = `J/modules/RTNFileModule.java`. No method checks plugin permissions; the
host is expected to enforce them (INFERENCE).

| Method | Reports | Lines |
| --- | --- | --- |
| `exists` | `false` for empty path, else `File.exists()` | 78-87 |
| `getExternalDirPath` | array of volume paths; `null` when none; rejects on reflection errors only | 91-111 |
| `makeDir` | `true` if exists, else `mkdirs()` result | 117-124 |
| `listFiles` | rejects "Dir is not exists" / "Not Did"; **resolves `null` for an empty or unreadable dir**; otherwise an array of **maps `{path, type}`** (type 0 dir, 1 file), not strings | 156-183 |
| `renameToFile` | rejects when source missing, then also resolves (second call is a no-op) | 133-141 |
| `copyFile` | rejects on `IOException` only | 145-153 |
| `getFileMD5` | `""` on failure | 188-195 |
| `deleteFile` / `deleteDir` | boolean | 198-210 |

- CONFIRMED unguarded paths: `getExternalDirPath` dereferences `getCurrentActivity()` with no
  null check (line 92) and catches only three checked reflection exceptions (line 106). A null
  activity gives a `NullPointerException` that is not turned into a rejection. Same pattern in
  `getFileList` / `getImageList` (lines 233, 313), `FileSelector` (lines 65-87) and `RTNUIUtils`
  (lines 18, 34).
- CONFIRMED `PluginCheck.java` throws an unchecked `SecurityException` for paths under the host's
  plugin directory that are not the plugin's own. Nothing in the SDK calls it; INFERENCE: the host
  injects it into `File` construction.
- INFERENCE: an unchecked Java exception in a TurboModule method goes to React Native's exception
  handler, which here is the host's `PluginJSExceptionHandler` implementation (abstract in the
  SDK), or kills the process. REPORTED by web-lookup `NOTES.md` lines 136-143: plugins run in a
  **privileged process**; an exception there "bypasses React error boundaries, the JS global
  handler and a Java uncaught-exception handler alike — the window just opens and disappears".
  This matches builds 8/9 (lifecycle 1, then the view closes). Whether a plugin's
  `getCurrentActivity()` is null at that moment is UNKNOWN (needs a device test).
- Ink2Pic consequences (for the brief, not edited): `src/sdk/files.ts` line 25-30 types
  `listFiles` as `string[]` but the host returns `{path, type}` maps, and maps an empty directory
  (`null`) to a failure.

## (d) Button event and lifecycle

- CONFIRMED the only emitter in the SDK is `PluginModule.sendData2RN(name, data)`
  (`J/modules/PluginModule.java` lines 47-50), which the host calls. Event names (JS constants,
  `src/PluginManager.ts` lines 32-48; also seen by rea in `lib/module`): `plugin_life`,
  `plugin_button_event`, `plugin_config_event`, `plugin_event_lang`, `plugin_event`.
- CONFIRMED JS subscribes to these only inside `PluginManager.init()` (`registerListener`, lines
  116-138, called at line 278). An event the host emits before `init()` runs is lost.
- CONFIRMED `init()` calls `onMounted()` and `reportSdkVersion()` (lines 279-280); per
  `J/core/PluginAppAPI.java` this is what tells the host the plugin is mounted. INFERENCE: the
  "lifecycle 1" seen on builds 8/9 is this `mounted` report, so the JS bundle loaded and `init()`
  ran; the failure came later.
- CONFIRMED lifecycle values: 0 initialized, 1 mounted, 2 start, 3 stop, 4 unmounted, 5 destroyed
  (`src/PluginManager.ts` lines 19-26, `J/core/state/PluginState.java`). Message shape
  `{data: {state}}`; JS echoes each state back with `onPluginLifeState` (line 123).
- CONFIRMED the last button, config and life message is cached for **1000 ms**
  (`setTimeout(..., 1000)`, lines 136, 201, 229). A listener registered later than 1 s after
  the event never sees it.
- CONFIRMED button event fields: `pressEvent, id, name, color, icon, bgColor`
  (`src/listener/ButtonListener.ts`); press values 0 down, 1 up, 2 long press, 3 click
  (`J/constant/PluginMenuEventState.java`).
- CONFIRMED `showPluginView` / `closePluginView` resolve `true` at once and post the real work to
  the UI thread (`J/modules/PluginModule.java` lines 141-169): `true` does not mean the view
  opened.
- REPORTED (web-lookup `index.js` lines 145-190, listener at 165): the button event can fire before `App` mounts,
  and a second press while the view is open does not remount it; they latch the id at module
  level in `index.js`.

## (e) Native modules and methods the JS calls

All via `TurboModuleRegistry.getEnforcing` (missing module = crash at import, CONFIRMED by the
API's contract):

- `NativePluginManager` (`src/module/NativePluginManager.ts`): onMounted, onStop,
  reportSdkVersion, onPluginLifeState, getOrientation, getPluginDirPath, getPluginName,
  getDeviceType, registerButtonRes, modifyButtonRes, unregisterButtonRes, getButtonState,
  setButtonState, registerConfigButton, showPluginView, closePluginView, invalidatePluginView,
  normalize, setFullAuto, sendPluginEvent, hasPermission, requestPermission.
- `RTNFileUtils` (`src/module/NativeFileUtils.ts`): exists, getExternalDirPath, makeDir,
  getExportPath, renameToFile, copyFile, listFiles, getFileMD5, deleteFile, deleteDir,
  getFileList, getImageList, openFilePath, getStorageAvailableSpace.
- `FileSelector`: selectImage, selectFile (Java also has selectFolder).
- `NativeUIUtils`: showErrorTipDialog, showRattaDialog.
- `NativePluginAPI` (`src/module/NativePluginAPI.ts`, Java `CommAPIModule`): about 100 note,
  lasso, layer, element, sticker, recognition and file methods (getPageSize, getLassoText,
  insertImage, generateNotePng, registerEventListener ...). These resolve an APIResponse map;
  errors come back as codes, including `PERMISSION_NO_DECLARE`, `PERMISSION_NO_REQUEST_READ`,
  `_WRITE`, `_DELETE`, `PERMISSION_NO_EXISTS` (enum `PluginAPIError` in the aar).
- Native view `TouchView` (prop `forbidTouchType`).
- Third-party native code is loaded by the host from the package's `app.npk` through
  `DexClassLoader` (`J/utils/DexUtils.java`); a missing class is only logged (line 57).

## Other plugins (step 2)

`.snplg` release assets could not be downloaded: GitHub REST and release pages for these
repositories answered 403 from this session. Their sources were cloned instead (shallow, not run,
since removed):

| Repository @ commit | Permissions declared | SDK use | Own native modules |
| --- | --- | --- | --- |
| `jpmoo/embedimage` @ 31e87b2 | none | `FileUtils.exists/makeDir/listFiles`, `registerButton` + listener in `index.js`, `closePluginView().catch` | none (stub package) |
| `Sparkinman/web-lookup-supernote-plugin` @ e841123 | INTERNET, FILE:READ, FILE:WRITE | hasPermission then requestPermission with desc; 1 or 2 = granted | Kotlin `LookUpWeb`, `LookUpSettings`, `LookUpClip`, `LookUpLog`; installs a Java crash handler (`Bootstrap.kt`) to log before death |
| `Keplex/supernote-pic2note` @ 5a210f8 | FILE:READ, FILE:WRITE | `ensurePermission` returns early when `hasPermission === 1`; wraps `FileUtils` calls in try/catch "the host may already be closing" | Java `LocalImageProcessor` |

REPORTED by web-lookup `NOTES.md`: INTERNET is enforced for every socket, a refused socket is
invisible from JS; WebView cannot be created in the privileged process; `buildPlugin.sh` without
Java silently drops `nativeCodePackage` from the generated config (lines 155-160).

## Firmware (step 3)

- Done on the owner's Mac: firmware 3.31.45 (1.07 GB) was downloaded from Ratta's help page, the
  PluginHost and Note app APKs were decompiled with jadx, and the findings were posted on
  [#34](https://github.com/martonpaulo/ink2pic/issues/34#issuecomment-6694734043). The cloud
  session could not reach `support.supernote.com`.

## Commands run

- `unzip -l` / `javap -constants` on `android/libs/plugincommonlib.aar` (copy in the session
  scratchpad, removed).
- `npx rea-agents@6.5.0 doctor`; `npx rea-agents@6.5.0 analyze-javascript-application
  <abs>/node_modules/sn-plugin-lib/lib/module --json` (13.8 MB; queried with jq for module and
  event strings; removed).
- `git clone --depth 1` of the three repositories above into `.scratch/re34/` (removed).
