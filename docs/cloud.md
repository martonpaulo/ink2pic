# Cloud rules

Which Ink2Pic issues a Claude Code cloud session can finish, and what that session has. The
shape follows Skill Deck's `skd-project-standards` `references/cloud-rules.md`.

## The cloud machine

Measured in the first Ink2Pic cloud backlog run, on 2026-11-06:

- Ubuntu 24.04, 4 vCPUs, 15 GB of memory.
- Node `v22.23.4`, npm `10.9.9`; `npm ci` installs the lockfile.
- Java: OpenJDK `21.0.12.1` (`java` and `javac`). `zip` and `unzip` are installed. Gradle 8.14.3
  and Maven 3.9.11 are in `/opt`; there is no Android SDK (`ANDROID_HOME` is unset).
- Network, by HTTP status of the site root: `openclipart.org` 200, `commons.wikimedia.org` 301
  (the redirect to the main page), `dl.google.com` 302, `repo1.maven.org` 429 at the root and 200
  for `/maven2/`.
- The Commons Action API (`/w/api.php`, a file search) answered **429** on the first call: the
  shared cloud IP is throttled. The Commons client is built from documented fixtures, and the live
  capture is left to a device run.
- The gate user `ink2pic-gates` exists; run the gate as
  `sudo -u ink2pic-gates -H bash -c 'cd /home/user/ink2pic && npm run validate'`.
- No Supernote. Every device behavior stays a test the owner runs.
- The native toolchain (build-tools 35.0.0, platform 35, the React Android 0.79.2 AAR) installs on
  demand with `bash scripts/native-toolchain.sh`, about 260 MB in `.toolchain/`, each archive
  checked against a pinned SHA-1. Maven Central rate-limits the cloud IP, so the AAR comes from
  Google's Maven Central mirror.

## What always runs in the cloud

Capture, planning, research and review of any issue. The `runs: cloud` label judges only
implementation.

## The rule for an issue

`.github/cloud.json` lists no Mac-only path: Ink2Pic has no code only a Mac can build. So every
implementation issue can run in the cloud, and its last criterion is often a device check the
owner runs on the Manta. Such an issue is delivered in the cloud, its build is published as a
prerelease, and the device check goes to the owner as a check card.

Run the rule, never reread it:

```bash
python3 <skill-deck>/skills/project-backlog/scripts/cloud_ready.py --root . check --repo martonpaulo/ink2pic
```

## The override lines

A body line `Needs the Mac: <reason>` keeps an issue off the cloud. A body line
`Runs in the cloud: <reason>` puts it there. The last one in the body wins.

## Who applies the label

`issue-capture` sets or clears `runs: cloud` when it writes an issue, `issue-plan` when it writes
the Plan. `project-groom` reports a label that disagrees with the rule.

## Splitting for the cloud

Ink2Pic has no Mac-only work, so an issue is not split for the cloud. An issue is split when its
device check would block code that can land before it.
