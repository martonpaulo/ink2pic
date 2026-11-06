Second Ink2Pic device test build, for [#3](https://github.com/martonpaulo/ink2pic/issues/3): `versionName` 0.1.0, `versionCode` 2. It repeats S0 and S3 with the fixes from build 1's results ([device-tests](https://github.com/martonpaulo/ink2pic/blob/main/docs/device-tests.md)).

- S0: build 1 found no keys in `NativeModules`. This build looks each candidate file or network module up by name.
- S3: build 1 failed with error 117. This build passes the note page size to `recognizeElements`, as other plugins do.

## Device checklist

1. On the phone, download `Ink2Pic.snplg` from this release. Expected: a file of about 265 KB.
2. Send the file to the Manta's `MyStyle` folder with the Supernote Partner app. Expected: `Ink2Pic.snplg` is in `MyStyle`.
3. On the Manta, open Settings > Apps > Plugins > Add Plugin and choose the new file. Expected: Ink2Pic shows version 0.1.0, with no error.
4. Open a note and tap the Ink2Pic sidebar button. Expected: `[S0 host]` lists one or more modules by name (for example `RTNFileUtils`), then `[S1 network]` as before.
5. Close the plugin. Write "soup" by hand, lasso it and tap Find picture in the lasso toolbar. Expected: `[S3 recognition]` shows `page size: 1920 x 2560` and `recognized: "soup"`.
6. Repeat step 5 with "wine", "beer", "tree" and "Napoleon". Expected: each word is recognized as written.
7. Take a screenshot of the page with the text boxes (swipe down > Screenshot).
8. Attach the screenshot to the Inbox card. For a failed step, write its number and what the view said.
