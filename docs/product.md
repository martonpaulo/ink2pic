# Ink2Pic product definition

Status: current, 2026-11-06. The research and plan behind it are in [`brief.md`](brief.md).

## What it is

Ink2Pic is a Supernote plugin: you write a word by hand, lasso it, and choose a picture of that
thing from the web, and the picture lands in your note.

## Who it is for

A Supernote Manta owner who studies or takes notes on the device and wants a picture of a real
thing (soup, a tree, a historical person) on the page, without a phone or a computer.

## The job

Put a fitting picture into the current note in a few seconds. Today the device has no way to do
this. The workarounds need a phone or computer, a manual import tap, or give a full-page template
background that cannot move ([brief section 13](brief.md#13-history-of-options-considered-and-rejected)).

## What it does

- Turns a lassoed handwritten word into a search, with the text editable before searching.
- Shows pictures from keyless public sources (Openclipart, Wikimedia Commons, with Wikidata naming
  a word's typical pictures), the most typical picture of the word first, six per page.
- Inserts the chosen picture with one tap, already sized and converted for the 16-gray screen.
- Keeps every inserted picture, with its license and attribution, in a library that works offline.
- Lets the person set, from the plugin's own Settings entry, the query languages and their order
  (default: the system language, then English; [#68](https://github.com/martonpaulo/ink2pic/issues/68)), the picture size, where it goes (below, beside, or in place
  of the word, deleted only on their tap), style, sources, data saver, and clear the library list;
  every other default is today's behaviour ([#70](https://github.com/martonpaulo/ink2pic/issues/70)).

## What it will never do

| Non-goal | Reason | Reopened when |
| :--- | :--- | :--- |
| Run or depend on a backend, proxy or Worker | The owner rejected any service to maintain | Never, by the owner's choice |
| Need a companion phone app | Everything happens on the Supernote | Never, by the owner's choice |
| Use sources that need an API key or account | Install must stay one file with no sign-up | A keyless source stops working and no keyless replacement exists |
| Ship a heavy component: a machine-learning model or runtime, or a large library, on the device | The owner wants the plugin light: search quality comes from rules, light pixel measures and better sources (owner, 2026-11-06) | Never, by the owner's choice |
| Localize the UI, or use a translation service | English is a requirement for the screens; queries in Portuguese, Spanish and Chinese are understood through Wikidata's own labels and the CLDR keywords of the OpenMoji index instead (owner, 2026-11-06, D4, [#67](https://github.com/martonpaulo/ink2pic/issues/67)) | Never, by the owner's choice |
| Create native `.snstk` sticker collections | Importing one always needs a manual tap | The SDK gains an import call without a tap |
| Put settings in the main flow | Defaults must make adjustment unnecessary | A device test shows a default that fails for real use |
| Support iOS or first-generation A5 / A6 | PluginHost runs on Android devices; the target is Manta | Nomad or A5X / A6X: when the owner has such a device to test on |

## How you know it worked

The MVP definition of done in [brief section 9.5](brief.md#95-definition-of-done-for-the-mvp):
on firmware 3.31.45, lasso a handwritten English word, tap, see results, tap one, and the picture is
in the note and the plugin is closed, in at most 3 taps and no keyboard. Saved pictures still
insert offline. No source or network failure is silent. No timing baseline exists yet; the first
device builds measure one.

## Constraints

- Device: Supernote Manta (A5 X2), firmware Chauvet 3.31.45, 1920 x 2560 px, 16 gray levels.
- Runtime locked by PluginHost: React Native 0.79.2, React 19.0.0, `sn-plugin-lib` 0.2.3 pinned
  exactly. Do not upgrade them separately.
- TypeScript everywhere; native Java only for what JavaScript provably cannot do
  ([brief section 6](brief.md#6-native-code-decision)).
- HTTPS only: PluginHost blocks cleartext HTTP.
- Wikimedia requires a descriptive User-Agent; it points to this public repository.
- The agent cannot reach the device. The owner runs every device test
  ([brief section 18](brief.md#18-device-test-protocol)).

## Limits the owner set

| Limit | Value | Set |
| :--- | :--- | :--- |
| Time to page 1 of a search | About 2 s on a good Wi-Fi | Owner, 2026-11-06 ([#65](https://github.com/martonpaulo/ink2pic/issues/65)) |
| Time to insert a picture | About 1.5 s on a good Wi-Fi | Owner, 2026-11-06 |
| Extra requests when a search finds nothing | At most 3 | Owner, 2026-11-06 ([#71](https://github.com/martonpaulo/ink2pic/issues/71)) |
| Weight on the device | No machine-learning model or runtime, no large library | Owner, 2026-11-06 |

## Alternatives considered

New-project gate, 2026-11-06, verdict «build»:

- The owner's own projects (`own_projects.py` over `~/proj` and every `martonpaulo` repository):
  no project does this job.
- GitHub (`gh search repos supernote plugin image`): `wolfsolver/supernote-image-insert-plugin`
  (broken on 3.31.45), `jpmoo/embedimage` and `Keplex/supernote-pic2note` (local files only, no
  search). Reopened if one of them adds a keyless web search.
- Every other option the research weighed is in [brief section 13](brief.md#13-history-of-options-considered-and-rejected).
- Not checked: app stores and package registries, because Supernote plugins ship only as
  `.snplg` files.

## Evidence on hand

The research brief, [`brief.md`](brief.md). No device test has run yet, so there are no
screenshots, timings or file sizes; each item marked TO TEST in the brief stays unproven until a
device test records it in `docs/device-tests.md`.

## Accepted evidence gaps

- Accessibility: no accessibility test runs inside PluginHost, and the Supernote has no screen
  reader to test with. The view code is the evidence: labels, touch targets of at least 10 mm,
  and contrast, as [brief section 8.4](brief.md#84-results-screen-e-ink-rules) sets them.
