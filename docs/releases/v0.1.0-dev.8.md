Eighth Ink2Pic device test build: every change ready to test since build 7, in one round. `versionName` 0.1.0, `versionCode` 8.

- The plugin has its own icon ([#31](https://github.com/martonpaulo/ink2pic/issues/31)).
- A tapped picture is prepared for the 16-gray screen and placed where the handwritten word was; if that placement fails, the host places it ([#17](https://github.com/martonpaulo/ink2pic/issues/17), [#20](https://github.com/martonpaulo/ink2pic/issues/20)).
- Each inserted picture is saved with its license; the Library button shows saved pictures and recent searches, and opens by itself with no network ([#14](https://github.com/martonpaulo/ink2pic/issues/14), [#15](https://github.com/martonpaulo/ink2pic/issues/15)).
- A repeated search and its thumbnails come from the device ([#16](https://github.com/martonpaulo/ink2pic/issues/16)).
- The log is also written to `MyStyle/Ink2Pic/logs/session.log` ([#21](https://github.com/martonpaulo/ink2pic/issues/21)).
- The button press can no longer leave the view on its starting screen ([#13](https://github.com/martonpaulo/ink2pic/issues/13)), and the fixes of the round's review ([#33](https://github.com/martonpaulo/ink2pic/issues/33)).

## Device checklist

1. Install `Ink2Pic.snplg` from this release through `MyStyle` and Settings > Apps > Plugins > Add Plugin, then restart the Manta.
2. Look at the Ink2Pic buttons in the side bar and the lasso bar. Expected: a picture frame with a pen.
3. Write "soup", lasso it, tap Find picture. Expected: six pictures, ◀ ▶ visible.
4. Tap one picture. Expected: the plugin closes; the picture, in grays, is where the word was.
5. Open Ink2Pic from the side bar and tap Library. Expected: the saved picture, and "soup" under Recent.
6. Tap the saved picture. Expected: it is added to the page again.
7. Lasso "soup" again. Expected: results at once.
8. Send a screenshot of the page and of Log. On a failure: the step number and `MyStyle/Ink2Pic/logs/session.log`.
