Fourteenth Ink2Pic device test build: build 13 with the fix from its round. `versionName` 0.1.0, `versionCode` 14.

- Files in `MyStyle/Ink2Pic` are written in place: the Supernote counts replacing a file as a delete, which failed every second insert and every second library save ([#62](https://github.com/martonpaulo/ink2pic/issues/62), [#48](https://github.com/martonpaulo/ink2pic/issues/48)).

## Device checklist

1. Install `Ink2Pic.snplg` from this release through `MyStyle` and Settings > Apps > Plugins > Add Plugin, then restart the Manta.
2. Lasso "apple", tap ••• then Find picture, and insert 4 different pictures one after another. Expected: all 4 go into the note.
3. Open Ink2Pic from the side bar and tap Library. Expected: the 4 pictures are listed.
4. Close and reopen Ink2Pic, tap Library. Expected: still the 4 pictures.
5. On a failure, send the step number and a screenshot of Log.
