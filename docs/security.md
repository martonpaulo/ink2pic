# Security

Ink2Pic's answer to each item of Skill Deck's application-security standard
(`skd-project-standards` › `references/security-standard.md`). The surfaces are a **native app** (the
plugin on the Supernote) and its CI; there is no server, API or database. Evidence comes from the
project audit of 2026-11-06 ([#51](https://github.com/martonpaulo/ink2pic/issues/51)).

| # | Item | Applies | Status | Evidence | Smallest fix |
| --- | --- | --- | --- | --- | --- |
| 1 | No hard-coded key | Yes: native app | Met | Item 1 scan over the tree: 0 token or private-key findings; `android/app/debug.keystore` is the unshipped template's debug keystore | None |
| 2 | No secret in Git history | Yes | Met | `git log -p --all` scan over 84 commits: 0 token or private-key findings | None |
| 3 | No privileged key in a client | Yes: native app | Met | No key at all: both picture sources are keyless | None |
| 4 | Public DB key versus RLS | No database | Not applicable | Local JSON files only | None |
| 5 | RLS on personal-data tables | No database | Not applicable | Same | None |
| 6 | No open policy | No database | Not applicable | Same | None |
| 7 | Least privilege | Yes | Met | `uses-permissions`: INTERNET, FILE:READ, FILE:WRITE, no delete; CI `contents: read`, write only in the prerelease job | None |
| 8 | No mass assignment | No API | Not applicable | No API surface | None |
| 9 | Parameterized queries | No SQL | Not applicable | No SQL | None |
| 10 | Validate external input | Yes: native app | Met | Source parsers, `parseLibrary` and `parseCache` validators, `SafePaths`, a 20 MB download limit | None |
| 11 | No sensitive screen without auth | Native app | Not applicable | The device holder is the user; no private remote data | None |
| 12 | Server-side session | No server | Not applicable | No server | None |
| 13 | Cookie flags | No cookies | Not applicable | No cookies | None |
| 14 | Hashed passwords | No passwords | Not applicable | No accounts | None |
| 15 | HTTPS everywhere | Yes: native app | Met | Fixed https origins; `SafePaths.checkHttps` refuses others; no `http://` in product code | None |
| 16 | Security headers | No served HTML | Not applicable | No web surface | None |
| 17 | Rate limits on AI and sensitive routes | No API | Not applicable | Client side: a search cache and small page sizes keep requests low | None |
| 18 | Bot protection | No public forms | Not applicable | No forms | None |
| 19 | Restricted uploads | No upload surface | Not applicable | Downloads are capped at 20 MB and decoded by content | None |
| 20 | Trimmed API responses | No API | Not applicable | No API | None |
| 21 | No leak in errors or logs | Yes | Met, with a recorded exception | Errors shown on screen carry no code or stack (`src/flow/failure.ts`). The logs in `MyStyle/Ink2Pic/logs/` hold the recognised handwriting and searched words, readable by other plugins with file access and over USB: kept on purpose, because the owner's rule is to log everything useful for a failure report (AGENTS.md); they hold no account, key or location | Log lengths instead of words, if the owner asks |
| 22 | Check packages before installing | Yes | Met | `package-lock.json` with integrity for every package; weekly `npm audit` in `scan.yml`; the native toolchain pinned by SHA-1 | None |
| 23 | Sensitive data encrypted at rest | Native app | Not applicable | No token or password stored; public pictures and recent words only | None |
| 24 | RLS audit before delivery | No database | Not applicable | No database | None |
