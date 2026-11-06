Third Ink2Pic device test build, for [#3](https://github.com/martonpaulo/ink2pic/issues/3): `versionName` 0.1.0, `versionCode` 3. Build 2 found that `getPageSize` needs the file read permission ([device-tests](https://github.com/martonpaulo/ink2pic/blob/main/docs/device-tests.md)).

- Both buttons first ask for file read, file write and internet access.
- The lasso button reads the page size, then recognizes the lassoed word; if the page size fails, it tries the Manta page size.
- Every report ends with a `[log]` section: each SDK call and web request, its answer and its time.

## Device checklist

1. On the phone, download `Ink2Pic.snplg` from this release (about 265 KB) and send it to the Manta's `MyStyle` folder with the Supernote Partner app.
2. On the Manta, open Settings > Apps > Plugins > Add Plugin and choose the new file. Expected: Ink2Pic is updated, with no error.
3. Open a note, write "soup" by hand, lasso it and tap Find picture in the lasso toolbar. Expected: the plugin asks for file access; choose Always allow for each prompt.
4. Expected after step 3: `[permissions]` shows each permission granted, and `[S3 recognition]` shows `recognized with page size 1920 x 2560: "soup"`.
5. Repeat step 3 with "wine", "beer", "tree" and "Napoleon". Expected: each word is recognized as written, with no new prompt.
6. Tap the Ink2Pic sidebar button. Expected: `[permissions]` shows each one granted before, then `[S0 host]` and `[S1 network]` as in build 2.
7. Take a screenshot of each page with text boxes (swipe down > Screenshot). The `[log]` section must be readable in it.
8. Attach the screenshots to the Inbox card. For a failed step, write its number; the `[log]` lines show where it stopped.
