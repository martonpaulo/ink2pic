First Ink2Pic device test build: the S0, S1 and S3 spikes of [#3](https://github.com/martonpaulo/ink2pic/issues/3), built from commit `3b46a22`, `versionName` 0.1.0, `versionCode` 1.

- The sidebar button lists the host's native modules (S0) and tests HTTPS to Openclipart and Wikimedia Commons (S1).
- The lasso button tests handwriting recognition (S3).
- Each result shows in the plugin view and as a text box on the current page.

## Device checklist

1. On the phone, download `Ink2Pic.snplg` from this release. Expected: a file of about 260 KB.
2. Send the file to the Manta's `MyStyle` folder with the Supernote Partner app. Expected: `Ink2Pic.snplg` is in `MyStyle`.
3. On the Manta, open Settings > Apps > Plugins > Add Plugin and choose the new file. Expected: Ink2Pic is in the list, with no error.
4. Open a note and tap the Ink2Pic sidebar button. At the internet prompt, choose Always allow. Expected: the view shows `[S0 host]` and `[S1 network]`, and the same text is a text box on the page.
5. Take a screenshot (swipe down > Screenshot). Expected: a new file in `SCREENSHOT/`.
6. Close the plugin. Write "soup" by hand, lasso it and tap Find picture in the lasso toolbar. Expected: `[S3 recognition]` with `recognized: "soup"`.
7. Repeat step 6 with "wine", "beer", "tree" and "Napoleon". Expected: each word is recognized as written.
8. Take a screenshot of the page with the text boxes, and send the screenshots from `SCREENSHOT/` through the Partner app. If a step fails, name the step and the text the view showed.
