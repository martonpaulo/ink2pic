Ninth Ink2Pic device test build: build 8 with the fix for its stall. `versionName` 0.1.0, `versionCode` 9.

- Build 8 stayed on «Starting…»: the host held the view at lifecycle 1, sent no button event, and ran no timer. Build 9 decides as soon as the view mounts, with no event and no timer: an active lasso selection opens the lasso flow, else an empty search ([#13](https://github.com/martonpaulo/ink2pic/issues/13)).
- The log now also shows the button and listener registrations made at start.
- Everything else is build 8's: the icon, e-ink preparation, placement at the lasso, the library, the caches and the log file.

## Device checklist

1. Install `Ink2Pic.snplg` from this release through `MyStyle` and Settings > Apps > Plugins > Add Plugin, then restart the Manta.
2. Write "soup", lasso it, tap Find picture. Expected: six pictures, ◀ ▶ visible.
3. Tap one picture. Expected: the plugin closes; the picture, in grays, is where the word was.
4. Open Ink2Pic from the side bar and tap Library. Expected: the saved picture, and "soup" under Recent.
5. Tap the saved picture. Expected: it is added to the page again.
6. Lasso "soup" again. Expected: results at once.
7. If a screen stops, wait 10 seconds and take a screenshot: it shows the log.
8. Send screenshots of the page and of Log; on a failure, the step number and `MyStyle/Ink2Pic/logs/session.log`.
