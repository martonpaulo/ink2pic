Sixteenth Ink2Pic device test build: Settings, languages, symbols, the new ranking, safer one-tap insert, and every finding of the 2026-11-07 audits and reviews. `versionName` 0.1.0, `versionCode` 16.

- The lasso buttons are now «Insert best picture» (one tap, never deletes your word) and «Choose picture» (the grid) ([#74](https://github.com/martonpaulo/ink2pic/issues/74), [#106](https://github.com/martonpaulo/ink2pic/issues/106)). «Insert best picture» stays on the note and opens the search screen only on a failure ([#93](https://github.com/martonpaulo/ink2pic/issues/93), [#96](https://github.com/martonpaulo/ink2pic/issues/96)).
- Settings > Apps > Plugins > Ink2Pic > Settings: search languages, picture size, placement, style, sources, data saver, word spacing, offline symbols, empty Library tab, reset ([#68](https://github.com/martonpaulo/ink2pic/issues/68), [#70](https://github.com/martonpaulo/ink2pic/issues/70), [#91](https://github.com/martonpaulo/ink2pic/issues/91)).
- OpenMoji symbols for abstract words, also offline once used or downloaded ([#67](https://github.com/martonpaulo/ink2pic/issues/67), [#91](https://github.com/martonpaulo/ink2pic/issues/91)).
- Ranking: no brand logo for a plain word, the organisation's own logo for a brand, the person's clean portrait first, the country's own flag, no near-black or quote posters on top, faint lines darkened, cleaner contours without stair steps, duplicates dropped ([#81](https://github.com/martonpaulo/ink2pic/issues/81), [#83](https://github.com/martonpaulo/ink2pic/issues/83), [#89](https://github.com/martonpaulo/ink2pic/issues/89), [#92](https://github.com/martonpaulo/ink2pic/issues/92), [#110](https://github.com/martonpaulo/ink2pic/issues/110)).
- A thin page tries the corrected spelling; the source-down line shows only on a thin or empty page ([#82](https://github.com/martonpaulo/ink2pic/issues/82), [#84](https://github.com/martonpaulo/ink2pic/issues/84)).
- «Lasso last word» picks the whole last word, or the whole name at the end of a line, in your own handwriting spacing ([#75](https://github.com/martonpaulo/ink2pic/issues/75), [#87](https://github.com/martonpaulo/ink2pic/issues/87), [#109](https://github.com/martonpaulo/ink2pic/issues/109)).
- Faster: pixel work on a small pool with the insert first, an appended log, lazy symbol checks ([#88](https://github.com/martonpaulo/ink2pic/issues/88), [#101](https://github.com/martonpaulo/ink2pic/issues/101), [#102](https://github.com/martonpaulo/ink2pic/issues/102)).
- Clearer screens: one status line, plain Settings names, a hint on how to add a picture ([#98](https://github.com/martonpaulo/ink2pic/issues/98), [#106](https://github.com/martonpaulo/ink2pic/issues/106)).

## Device checklist

1. Install `Ink2Pic.snplg` from this release through `MyStyle` and Settings > Apps > Plugins > Add Plugin, then restart the Manta.
2. Settings > Apps > Plugins > Ink2Pic > Settings. Expected: the Settings screen opens; add Português in Search languages.
3. Write «apple», lasso it, tap ••• then Insert best picture. Expected: an apple drawing (not the Apple logo) goes in at once, lassoed, with no plugin screen; tap Delete on the lasso toolbar and it is gone.
4. Write «Quem foi Miguel de Cervantes», open Ink2Pic from the side bar, tap Log, tap Lasso last word, then ••• and Choose picture. Expected: «Miguel de Cervantes» is lassoed, and a clean portrait is first.
5. Lasso «apple logo», «Spain» and «cold», each with Choose picture. Expected: the plain Apple logo first; the Spanish flag first, with its colours as greys; a snowflake symbol.
6. In Settings, tap Download symbols for offline use, then turn Wi-Fi off and lasso «happy» with Choose picture. Expected: symbols show with no internet.
7. Turn Wi-Fi back on. Lasso «Confucious Institute» with Choose picture. Expected: «Showing results for confucius institute».
8. Send `MyStyle/Ink2Pic/logs/session.log`, and on a failure the step number and a screenshot.
