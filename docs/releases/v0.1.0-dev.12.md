Twelfth Ink2Pic device test build: build 11 with the fix from its round. `versionName` 0.1.0, `versionCode` 12.

- A permission turned off in Settings is named on the screen before Start, not only after a denial ([#37](https://github.com/martonpaulo/ink2pic/issues/37)).

## Device checklist

1. Install `Ink2Pic.snplg` from this release through `MyStyle` and Settings > Apps > Plugins > Add Plugin, then restart the Manta.
2. In Settings > Apps > Plugins > Ink2Pic > Permissions, set Network Access to Don't Allow. Lasso a written word and tap Find picture. Expected: «Ink2Pic needs internet access to search pictures.» above Start.
3. Tap Start and allow. Expected: the search runs.
4. Lasso "apple" again. Expected: the pictures show at once, read from the device ([#16](https://github.com/martonpaulo/ink2pic/issues/16)).
5. Open `MyStyle/Ink2Pic/logs/` in the file manager. Expected: `session.log` ([#21](https://github.com/martonpaulo/ink2pic/issues/21)).
6. Send screenshots of steps 2, 4 and 5.
