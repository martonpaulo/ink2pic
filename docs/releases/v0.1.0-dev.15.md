Fifteenth Ink2Pic device test build: the new search and the faster insert. `versionName` 0.1.0, `versionCode` 15. Settings, languages and OpenMoji symbols come in the next build.

- A new lasso button, Insert picture, inserts the best picture at once, with no grid ([#74](https://github.com/martonpaulo/ink2pic/issues/74)).
- The inserted picture stays lassoed, ready to move or resize ([#73](https://github.com/martonpaulo/ink2pic/issues/73)).
- The search understands style words such as "logo" and "photo", corrects misspellings ("Showing results for …"), ranks text-only pictures low, leaves signatures out, and keeps working when a source fails ([#65](https://github.com/martonpaulo/ink2pic/issues/65)).
- People and named things are found through Wikipedia, with the portrait and pictures that depict them; a cut word or a long phrase still finds something ([#71](https://github.com/martonpaulo/ink2pic/issues/71)).
- Pictures are ranked by cheap pixel measures, and dark photos and paintings become contour drawings ([#66](https://github.com/martonpaulo/ink2pic/issues/66)); page 3 and later are measured as each page loads ([#72](https://github.com/martonpaulo/ink2pic/issues/72)).
- A picture whose thumbnail fails is dropped, and transparent pictures show on white ([#64](https://github.com/martonpaulo/ink2pic/issues/64)).
- Adult and explicit pictures are left out of every search ([#69](https://github.com/martonpaulo/ink2pic/issues/69)).
- The Log view has two probe buttons for the one-button idea ([#75](https://github.com/martonpaulo/ink2pic/issues/75)).

## Device checklist

1. Install `Ink2Pic.snplg` from this release through `MyStyle` and Settings > Apps > Plugins > Add Plugin, then restart the Manta.
2. Write "apple", lasso it, tap ••• then Insert picture. Expected: an apple drawing goes into the note at once, with the lasso around it.
3. Lasso "apple logo" and tap Find picture. Expected: the Apple logo is on page 1.
4. Lasso "Miguel de Cervantes" and tap Find picture. Expected: drawings and the portrait first; no signature, no picture of text alone.
5. Lasso "Confucious Institute" and tap Find picture. Expected: "Showing results for" a corrected spelling, with pictures.
6. Open Ink2Pic from the side bar, tap Log, tap "Probe pen and page". Expected: the view closes and a picture on the page gets the lasso.
7. Write a short word, open Ink2Pic, tap Log, tap "Lasso last word". Expected: only that word is lassoed.
8. Send `MyStyle/Ink2Pic/logs/session.log`, and on a failure the step number and a screenshot.
