# Cloud rules

Which Ink2Pic issues a Claude Code cloud session can finish, and what that session has. The
shape follows Skill Deck's `skd-project-standards` `references/cloud-rules.md`.

## The cloud machine

Not yet measured in a real Ink2Pic cloud session. Replace this section with the first session's
measurements and their date.

Expected, from the research session of 2026-11-06 ([brief section 16.1](brief.md#161-where-each-part-runs)):

- Ubuntu with Node, Java (`openjdk-17-jdk-headless` from `.github/cloud.json`) and `zip`.
- Network: npm, GitHub, Openclipart, `dl.google.com` and Maven Central were reachable. Wikimedia
  Commons throttled the shared cloud IP on the first call.
- No Supernote. Every device behavior stays a test the owner runs.
- No Android SDK build tools (`aapt2`, `d8`) until `scripts/cloud-setup.sh` installs them with a
  pinned checksum, which the native build issue adds when native code is needed.

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
