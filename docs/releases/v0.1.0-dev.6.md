Sixth Ink2Pic device test build, for [#11](https://github.com/martonpaulo/ink2pic/issues/11) and [#13](https://github.com/martonpaulo/ink2pic/issues/13): `versionName` 0.1.0, `versionCode` 6. It has everything of build 5 (the lasso flow and the results grid) and fixes the file test of build 4, which stopped at «…» with no report.

- Every SDK and module call has a 20-second limit: a call that never answers shows `TIMEOUT` in the log instead of freezing the screen.
- The Log screen updates live, line by line.
- The Java module now reports every kind of error, so its calls always answer.
- The Log screen has a Check files button: it shows whether the file module is loaded, downloads one picture into `MyStyle/Ink2Pic/library/`, and writes and reads back a text file.

## Device checklist

1. On the phone, download `Ink2Pic.snplg` from this release and send it to the Manta's `MyStyle` folder with the Supernote Partner app. On the Manta, open Settings > Apps > Plugins > Add Plugin and choose the new file.
2. Restart the Manta, so the new native code loads.
3. Write "soup" by hand, lasso it and tap Find picture. Expected: the field shows `soup`, then six large pictures appear at once, with no scrolling.
4. Tap ▶, then ◀. Expected: the next six pictures, then the first six again. Then change the word to "tree" and tap Search. Expected: results for "tree".
5. Tap Log, then Check files. Expected: the lines appear one by one; `Ink2PicFiles (…)` lists `downloadToFile`, `readText` and `writeText`, then `downloadToFile … -> ok 24197`, `exists -> ok true` and `readText -> ok`.
6. In the file manager, open `MyStyle/Ink2Pic/library/`. Expected: `spike-340609.png` is there.
7. Close, then tap the Ink2Pic sidebar button. Expected: the search screen with an empty field.
8. Take screenshots of the results and of the log after Check files, and attach them to the Inbox card. For a failed step, write its number.
