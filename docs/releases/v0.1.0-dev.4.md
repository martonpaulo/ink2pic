Fourth Ink2Pic device test build, for [#11](https://github.com/martonpaulo/ink2pic/issues/11) and [#3](https://github.com/martonpaulo/ink2pic/issues/3): `versionName` 0.1.0, `versionCode` 4. It is the first build with native code: a small Java module, `Ink2PicFiles`, that downloads a picture to a file and writes text files, because the host has none (S0, [device-tests](https://github.com/martonpaulo/ink2pic/blob/main/docs/device-tests.md)).

- The sidebar button adds `[S2 write]`: it downloads one Openclipart picture into `MyStyle/Ink2Pic/library/` and writes and reads back a text file in the plugin's own folder.
- The lasso button is the same as in build 3.

## Device checklist

1. On the phone, download `Ink2Pic.snplg` from this release and send it to the Manta's `MyStyle` folder with the Supernote Partner app.
2. On the Manta, open Settings > Apps > Plugins > Add Plugin and choose the new file. Expected: Ink2Pic is updated, with no error.
3. Restart the Manta: this build adds native code, which loads only after a restart.
4. Open a note and tap the Ink2Pic sidebar button. Expected: `[S2 write]` shows `download: 24197 bytes to .../MyStyle/Ink2Pic/library/spike-340609.png`, `exists: true` and `read back same text`.
5. In the file manager, open `MyStyle/Ink2Pic/library/`. Expected: `spike-340609.png` is there and opens as a picture of a ladle.
6. If build 3 was not tested yet, run its lasso steps now: lasso "soup" and tap Find picture. Expected: `recognized with page size 1920 x 2560: "soup"`.
7. Take a screenshot of each page with text boxes (swipe down > Screenshot), with the `[log]` section readable.
8. Attach the screenshots to the Inbox card. For a failed step, write its number; the `[log]` lines show where it stopped.
