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
