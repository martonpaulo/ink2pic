Eleventh Ink2Pic device test build: build 10 with the fixes from its round. `versionName` 0.1.0, `versionCode` 11.

- The picture goes just below the lassoed word, never over it; a tall picture shrinks to fit ([#39](https://github.com/martonpaulo/ink2pic/issues/39)).
- A permission dialog waits up to 5 minutes, and «Always Allow» counts as granted ([#13](https://github.com/martonpaulo/ink2pic/issues/13), [#34](https://github.com/martonpaulo/ink2pic/issues/34)).
- A new lasso after the note was left and reopened starts a new search, not the old one ([#34](https://github.com/martonpaulo/ink2pic/issues/34)).
- Every failure shows one sentence with its cause and the next step; Log no longer opens by itself; a missing internet permission is named as such ([#37](https://github.com/martonpaulo/ink2pic/issues/37)).
- A new page says «Loading pictures…» while its thumbnails load, not «Searching…» ([#35](https://github.com/martonpaulo/ink2pic/issues/35)).
- Every screen has Log and Close; the starting screen shows one line; an error never goes into the note ([#36](https://github.com/martonpaulo/ink2pic/issues/36)).

## Device checklist

1. Install `Ink2Pic.snplg` from this release through `MyStyle` and Settings > Apps > Plugins > Add Plugin, then restart the Manta.
2. Open Ink2Pic from the side bar. Expected: «Starting…» with Log and Close. Tap Start; on each dialog wait 30 seconds, then Always Allow. Expected: the Library opens, with no «needs» message.
3. Write "apple", lasso it, tap Find picture. Expected: six pictures; on page 2, «Loading pictures…» then the pictures.
4. Tap one. Expected: it appears just below the word, the word still visible.
5. Turn Wi-Fi off, lasso "apple", tap Find picture. Expected: a sentence saying there is no internet, and the Library.
6. Turn Wi-Fi on. In Settings > Apps > Plugins > Ink2Pic > Permissions, set Network Access to Don't Allow, then lasso "apple" and tap Find picture. Expected: a sentence naming internet access and where to allow it. Set it back to Allow.
7. Tap Log on any screen. Expected: the call log; tap Log again to hide it.
8. Send screenshots of steps 3 to 7; on a failure, the step number and `MyStyle/Ink2Pic/logs/session.log`.
