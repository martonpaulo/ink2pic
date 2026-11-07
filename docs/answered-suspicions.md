# Answered suspicions

Suspected defects that were measured and found not to be defects. Read this before investigating or reporting one. A row is reported again only when its reopening condition is met; its status then becomes «reopened» with the issue link.

| Date | Suspicion | Measurement or evidence | Why it is not a defect | Reopen when | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 2026-11-07 | The «o» of «frio» vanished after «Lasso last word» | Build 15 session log: no delete, insert or modify call; `lassoElements` returned false | The owner erased it by hand | A log shows a delete call the person did not ask for | answered |
| 2026-11-07 | A library lost update between `recordSearch` and `recordInsert` | Bug audit trace of `src/library/device.ts`: `save()` sets `current` synchronously | An overlap needs the first load still pending during an insert | A device log shows an insert before the library's first load ends | answered |
| 2026-11-07 | Two writes to one file at the same time | Bug audit: every `writeText` runs on the one `files` thread, and every download on the one `downloads` thread | The threads serialize them | A second files or downloads thread is added | answered |
| 2026-11-07 | Double taps on onboarding, a grid tile, the headless insert, Clear or the symbols confirm | Bug audit: guarded by a `useRef`, `inserting`, `running` or `pending`, or idempotent | Each second tap is ignored or harmless | A new tap target without a guard | answered |
| 2026-11-07 | Unhandled promise rejections from SDK or module calls | Bug audit: every call goes through `attempt` or `callModule`, which return a Result; `ModuleWork.submit` catches `Throwable` | Failures arrive as Results | A call that bypasses `attempt` or `callModule` | answered |
| 2026-11-07 | `sn-plugin-lib` or the Supernote template is behind upstream | Architecture audit: 0.2.3 and 1.0.13 are the newest on npm | Nothing newer exists | npm lists a newer version | answered |
| 2026-11-07 | The Spanish flag turned into a white box because of the grey conversion | [#89](https://github.com/martonpaulo/ink2pic/issues/89) lane: plain luma already gives dark bands and a light middle | The cause was the XDoG contour on flat areas, fixed in [#83](https://github.com/martonpaulo/ink2pic/issues/83) | A flat-colour picture is shown as a contour again | answered |
