Thirteenth Ink2Pic device test build: the project audit of 2026-11-06, the owner's search requests and build 12's fixes, in one build with one check. `versionName` 0.1.0, `versionCode` 13.

- Search: the typical picture first: a plain drawing, then the word's Wikidata pictures (flag, symbol, portrait); stylised graphics last ([#43](https://github.com/martonpaulo/ink2pic/issues/43), [#59](https://github.com/martonpaulo/ink2pic/issues/59)).
- Opening: the latest press always wins; a close and reopen never leaves «Starting…» or the old word ([#44](https://github.com/martonpaulo/ink2pic/issues/44), [#58](https://github.com/martonpaulo/ink2pic/issues/58)).
- Insert: success only when the picture is in the note; no tap through «Loading pictures…»; one file per picture, no redirect, no upscale, library hits from disk ([#47](https://github.com/martonpaulo/ink2pic/issues/47), [#48](https://github.com/martonpaulo/ink2pic/issues/48)).
- Network, disk and memory: each thumbnail downloaded once, the insert never waits behind them, a bounded log written once per call ([#45](https://github.com/martonpaulo/ink2pic/issues/45), [#46](https://github.com/martonpaulo/ink2pic/issues/46), [#55](https://github.com/martonpaulo/ink2pic/issues/55)).
- Screens: clearer onboarding and search, one fixed status line, every error with a next step, no Check files button ([#49](https://github.com/martonpaulo/ink2pic/issues/49), [#50](https://github.com/martonpaulo/ink2pic/issues/50), [#52](https://github.com/martonpaulo/ink2pic/issues/52), [#53](https://github.com/martonpaulo/ink2pic/issues/53)).
- Library: kept across updates, and the pictures of builds 10 to 12 listed again ([#41](https://github.com/martonpaulo/ink2pic/issues/41), [#61](https://github.com/martonpaulo/ink2pic/issues/61)); the keyboard closes on search ([#42](https://github.com/martonpaulo/ink2pic/issues/42)); missing permissions are named ([#37](https://github.com/martonpaulo/ink2pic/issues/37)).

## Device checklist

1. Install `Ink2Pic.snplg` from this release through `MyStyle` and Settings > Apps > Plugins > Add Plugin, then restart the Manta.
2. Open Ink2Pic from the side bar. Expected: the Library lists the pictures saved before (ladle, Napoleon, apple).
3. Write "esperanto", lasso it, tap ••• then Find picture. Expected: the Esperanto flag or green star on page 1, pictures (not titles) on the first page.
4. Do the same with "Napoleon" and "apple". Expected: a drawing and a portrait of Napoleon; a plain drawing of an apple first.
5. Tap a picture. Expected: it appears just below the word.
6. Lasso a word, tap Find picture, tap Close at once, lasso another word, Find picture. Expected: the search for the second word.
7. Type a word in the field and tap Search. Expected: the keyboard closes; six pictures and the pager show.
8. Send screenshots of steps 2 to 7, and on a failure the step number and `MyStyle/Ink2Pic/logs/session.log` and `session.prev.log`.
