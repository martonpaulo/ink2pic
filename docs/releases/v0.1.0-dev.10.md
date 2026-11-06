Tenth Ink2Pic device test build: build 9 with the fix for its sudden close. `versionName` 0.1.0, `versionCode` 10.

- Build 9 showed «Starting…» for an instant and closed. Its first file call went to the host's file module, which can close the plugin on an error. Build 10 reaches files only through Ink2Pic's own module, and takes the storage root from the paths the host already gave ([#13](https://github.com/martonpaulo/ink2pic/issues/13)).
- The log reaches `MyStyle/Ink2Pic/logs/session.log` from the start, written before and after every call, so a sudden close leaves its last line in the file.
- Any JavaScript error is written into the page as a text box and into `MyStyle/Ink2Pic/logs/crash.log`.

## Device checklist

1. Install `Ink2Pic.snplg` from this release through `MyStyle` and Settings > Apps > Plugins > Add Plugin, then restart the Manta.
2. Write "soup", lasso it, tap Find picture. Expected: six pictures, ◀ ▶ visible.
3. Tap one picture. Expected: the plugin closes; the picture, in grays, is where the word was.
4. Open Ink2Pic from the side bar and tap Library. Expected: the saved picture, and "soup" under Recent.
5. Lasso "soup" again. Expected: results at once.
6. If the plugin closes by itself: open `MyStyle/Ink2Pic/logs/` in the file manager.
7. Expected in that case: `session.log`, and maybe `crash.log`, with the last lines.
8. Send screenshots of the page and of Log; on a failure, the step number and the two log files.
