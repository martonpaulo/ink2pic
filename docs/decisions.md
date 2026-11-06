# Ink2Pic decisions

The history of consequential decisions. Each current rule lives where the last column says.

## Decision index

| Date | Decision | What it replaced | Where the rule lives |
| :--- | :--- | :--- | :--- |
| 2026-11-06 | Build Ink2Pic after the new-project gate; no existing plugin searches the web | Nothing | [`product.md`](product.md#alternatives-considered) |
| 2026-11-06 | Public repository `martonpaulo/ink2pic`, MIT | Nothing | [`AGENTS.md`](../AGENTS.md#project-identity-and-policy) |
| 2026-11-06 | Work on `main`; commit and push each validated task automatically | Nothing | [`AGENTS.md`](../AGENTS.md#project-identity-and-policy) |
| 2026-11-06 | SemVer from `0.1.0` in `package.json`; `versionCode` per device build; release only on request | Nothing | [`AGENTS.md`](../AGENTS.md#project-identity-and-policy) |
| 2026-11-06 | npm and ESLint from the Supernote template instead of the fleet's pnpm and Biome | Fleet default | [`AGENTS.md`](../AGENTS.md#project-identity-and-policy) |
| 2026-11-06 | Generated `ios/` folder and `Gemfile` removed: PluginHost runs on Android only | Template output | [`brief.md`](brief.md#172-bootstrap-commands) |
| 2026-11-06 | A pushed `v*-dev.*` tag publishes the device test prerelease through the `Prerelease` workflow; `v0.1.0-dev.1` made by hand from a Mac session ([#22](https://github.com/martonpaulo/ink2pic/issues/22), D1 = A) | Releases made only by the session | [`AGENTS.md`](../AGENTS.md#configuration-and-repository-hygiene) |
| 2026-11-06 | A push to `main` that raises `versionCode` in `PluginConfig.json` publishes the device test prerelease, so a cloud session delivers builds alone (owner decision D2 A, [#22](https://github.com/martonpaulo/ink2pic/issues/22)) | A tag pushed from a Mac session for each build | [`AGENTS.md`](../AGENTS.md#configuration-and-repository-hygiene) |
| 2026-11-06 | Every device build requests its permissions before the first file or note call and logs every SDK call with its answer (owner, after build 0.1.0 (2), [#3](https://github.com/martonpaulo/ink2pic/issues/3)) | Permissions asked only where a probe needed them; results without a call log | [`AGENTS.md`](../AGENTS.md#ink2pic-rules) |
| 2026-11-06 | Public distribution after the MVP: InkHub through Ratta's review, `fharper/awesome-supernote`, r/Supernote_dev and r/Supernote (owner decision D3 A, [#25](https://github.com/martonpaulo/ink2pic/issues/25)) | Personal use of a public repository | [`brief.md`](brief.md#12-decisions-taken-by-default) |
| 2026-11-06 | One device build per test round with everything ready to test and one check card (owner) | One build and one card per issue | [`AGENTS.md`](../AGENTS.md#ink2pic-rules) |
| 2026-11-06 | Read the recorded platform gotchas and the official docs before any SDK call or device fix (owner, after three device rounds lost to known gotchas) | Reading the references only in part | [`brief.md`](brief.md#105-known-platform-gotchas-read-them-before-an-sdk-call) |
| 2026-11-06 | Page 1 shows the most typical picture of the word: a simple drawing, then the word's canonical pictures from Wikidata (flag, logo, image), stylised graphics last; Commons searched for drawings (owner, [#43](https://github.com/martonpaulo/ink2pic/issues/43)) | Line art and engravings first, every Commons file type | [`brief.md`](brief.md#55-ranking-and-its-measurement) |
| 2026-11-06 | The social card uses the e-ink screen's own palette: near-black ink on warm paper with greys, no blue or other colour and no gradient, because the plugin lives on a Supernote (owner; recorded by [#53](https://github.com/martonpaulo/ink2pic/issues/53)) | A comment in the card's HTML only | [`social-card.html`](../design/social-card/social-card.html) |
| 2026-11-06 | No account, no server and nothing heavy: no machine-learning model or runtime and no large library on the device; search quality comes from rules, light pixel measures and better keyless sources (owner) | Learned ranking was an open option | [`product.md`](product.md#what-it-will-never-do) |
| 2026-11-06 | Queries in Portuguese, Spanish and Chinese are understood through Wikidata's multilingual labels, with no translation service (owner, D4) | Never translate non-English queries | [`product.md`](product.md#what-it-will-never-do) |
| 2026-11-06 | Dark photos and paintings are turned into a contour drawing automatically, light Java filter, and the grid shows the converted picture (owner, D5) | Pictures always inserted as found | [`product.md`](product.md#what-it-will-never-do) |
