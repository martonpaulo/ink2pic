Seventh Ink2Pic device test build: one round with everything ready to test, for [#13](https://github.com/martonpaulo/ink2pic/issues/13), [#9](https://github.com/martonpaulo/ink2pic/issues/9), [#11](https://github.com/martonpaulo/ink2pic/issues/11) and [#12](https://github.com/martonpaulo/ink2pic/issues/12). `versionName` 0.1.0, `versionCode` 7. It fixes the three problems the owner found in build 6.

- The ◀ ▶ buttons are always on screen: the grid takes the height that is left, and Log moved to the top bar.
- If the button event does not arrive within 2 seconds, the plugin opens by itself (the lasso flow when a lasso is active, else an empty search); the starting screen shows the log live; every permission check has a time limit.
- Check files writes its first log line at once and logs any error.
- New: one tap on a result downloads it into `MyStyle/Ink2Pic/library/` and inserts it into the note, then closes the plugin.

## Device checklist

1. On the phone, download `Ink2Pic.snplg` from this release, send it to the Manta's `MyStyle` folder with the Supernote Partner app, install it with Settings > Apps > Plugins > Add Plugin, and restart the Manta.
2. Write "soup" by hand, lasso it and tap Find picture. Expected: `soup` in the field and six pictures, with ◀ ▶ visible below them.
3. Tap ▶, then ◀. Expected: the next six pictures, then the first six again.
4. Tap one picture. Expected: `Adding to your note…`, then the plugin closes and the picture is on the page. Note where it landed and its size.
5. Tap the Ink2Pic sidebar button. Expected: the search screen with an empty field, never a screen stuck on `Starting…`.
6. Tap Log, then Check files. Expected: `check files: start`, then lines for `Ink2PicFiles`, `downloadToFile`, `exists` and `readText`.
7. If any screen stays on `Starting…` or `Searching…`, take a screenshot of it: it shows the log.
8. Attach screenshots of the inserted picture and of the log to the Inbox card, with the number of any failed step.
