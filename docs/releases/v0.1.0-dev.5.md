Fifth Ink2Pic device test build: the first build with the real flow, for [#13](https://github.com/martonpaulo/ink2pic/issues/13), [#9](https://github.com/martonpaulo/ink2pic/issues/9) and [#18](https://github.com/martonpaulo/ink2pic/issues/18). `versionName` 0.1.0, `versionCode` 5.

- Lasso a handwritten word and tap Find picture: the word is recognized, shown in an editable field and searched at once; results from Openclipart and Wikimedia Commons show six at a time.
- The sidebar button opens the same screen with an empty field.
- Tapping a result only records it for now; inserting it into the note comes next.
- The Log button shows every SDK call and web request with its answer.

## Device checklist

1. On the phone, download `Ink2Pic.snplg` from this release and send it to the Manta's `MyStyle` folder with the Supernote Partner app. On the Manta, open Settings > Apps > Plugins > Add Plugin and choose the new file.
2. Restart the Manta if build 4 was never installed (native code loads only after a restart).
3. Write "soup" by hand, lasso it and tap Find picture. Expected: the field shows `soup` and, after the static text `Searching…`, six large pictures appear at once, with no scrolling.
4. Tap ▶, then ◀. Expected: the next six pictures, then the first six again, each page drawn once.
5. Tap the field, change the word to "tree" and tap Search. Expected: new results for "tree".
6. Close, then tap the Ink2Pic sidebar button. Expected: the same screen with an empty field.
7. Tap Log. Expected: lines for `getPageSize`, `recognizeElements` and each source.
8. Take a screenshot of the results and of the log, and attach them to the Inbox card. For a failed step, write its number.
