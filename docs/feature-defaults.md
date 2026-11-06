# Feature defaults

One row per user-facing feature, as Skill Deck's interface standard (rule 12) asks. Ink2Pic has no
settings screen: every default is fixed, with its reason ([#51](https://github.com/martonpaulo/ink2pic/issues/51)).

| Feature | Default | Can the person change it? |
| --- | --- | --- |
| Search after a lasso | Submitted at once with the recognised word | Fixed: the three-tap path (brief section 8.2); the word can be edited and searched again |
| The handwritten word | Kept on the page; the picture goes just below it | Fixed: the handwriting is the person's note ([#39](https://github.com/martonpaulo/ink2pic/issues/39)) |
| Results per page | Six large tiles, two columns | Fixed: e-ink tap targets and one refresh per page (brief section 8.4) |
| Picture sources | Openclipart and Wikimedia Commons, together | Fixed: keyless sources only (docs/product.md) |
| Inserted width | About one third of the page (640 px) | Fixed until the device calibration in brief section 7 |
| Recent searches | The last 8 words | Fixed: brief section 8.6 |
| Library | Every inserted picture, kept in `MyStyle/Ink2Pic/library` | Fixed: the person deletes files with the file manager |
| No network | The search falls back to the Library | Fixed: brief section 8.8 |
| Log | Hidden behind the Log button; files in `MyStyle/Ink2Pic/logs` | Fixed: the owner's logging rule ([#36](https://github.com/martonpaulo/ink2pic/issues/36)) |
