# Feature defaults

One row per user-facing feature, as Skill Deck's interface standard (rule 12) asks. Every default
is fixed, with its reason ([#51](https://github.com/martonpaulo/ink2pic/issues/51)), except the rows
the plugin's Settings entry changes; each of those names its reset group, and Reset restores its
default ([#68](https://github.com/martonpaulo/ink2pic/issues/68)).

| Feature | Default | Can the person change it? |
| --- | --- | --- |
| Search languages | The device's system language when the search supports it (中文, Español, English, Português), then English; English alone when the system language is unknown | Yes: Settings > Apps > Plugins > Ink2Pic > Settings > Languages; reset group «languages» ([#68](https://github.com/martonpaulo/ink2pic/issues/68)) |
| Search after a lasso | Submitted at once with the recognised word | Fixed: the three-tap path (brief section 8.2); the word can be edited and searched again |
| The handwritten word | Kept on the page; the picture goes just below it | Fixed: the handwriting is the person's note ([#39](https://github.com/martonpaulo/ink2pic/issues/39)) |
| Results per page | Six large tiles, two columns | Fixed: e-ink tap targets and one refresh per page (brief section 8.4) |
| Picture sources | Openclipart and Wikimedia Commons, together | Fixed: keyless sources only (docs/product.md) |
| Adult and explicit pictures | Left out of every search, from every source | Fixed: the owner asked for a filter that is always on ([#69](https://github.com/martonpaulo/ink2pic/issues/69), brief section 5.6) |
| Inserted width | About one third of the page (640 px) | Fixed until the device calibration in brief section 7 |
| Recent searches | The last 8 words | Fixed: brief section 8.6 |
| Library | Every inserted picture, kept in `MyStyle/Ink2Pic/library` | Fixed: the person deletes files with the file manager |
| No network | The search falls back to the Library | Fixed: brief section 8.8 |
| Log | Hidden behind the Log button; files in `MyStyle/Ink2Pic/logs` | Fixed: the owner's logging rule ([#36](https://github.com/martonpaulo/ink2pic/issues/36)) |
