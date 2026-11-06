# Where Supernote owners find plugins

Research for [#25](https://github.com/martonpaulo/ink2pic/issues/25), read on 2026-11-06. Every claim
names its source. The research session's proxy blocked `reddit.com`, `supernote.com`,
`docs.supernote.com`, `ratta.helpjuice.com` and `docs.github.com`; claims from those hosts come
from search-result snippets only and are marked **(snippet)**. GitHub's own documentation was read
through its source repository, `github/docs`.

## Contents

- [Official channel: InkHub](#official-channel-inkhub)
- [Communities](#communities)
- [Curated lists](#curated-lists)
- [How other plugins were announced](#how-other-plugins-were-announced)
- [GitHub search](#github-search)
- [Ranked channels](#ranked-channels)
- [Open points](#open-points)

## Official channel: InkHub

- InkHub, the store on the device, offers plugins since Chauvet 3.29.43 beta (2026-08-26). The
  help page says a plugin downloaded from a third-party source such as GitHub bypasses Ratta's
  review, and sets the limits of 30 installed and 10 enabled plugins. Sources:
  <https://support.supernote.com/changelog-for-the-beta-versions-of-manta-and-nomad>,
  <https://ratta.helpjuice.com/how-to-install-and-manage-plugins> (snippet).
- Ratta's post «Plugin Review Process & Publishing Requirements» on r/Supernote_dev (late October
  2026) names the stages: submit, basic inspection, function verification, security review,
  publish. A small or simple plugin is not refused for that alone. A plugin may reach files, data
  and the network only within what the user authorized (snippet).
- A third-party checklist derived from that post,
  <https://github.com/gorlix/supernote-plugin-dev/blob/main/skills/supernote-plugin-dev/references/publish-review.md>
  (read), adds: the function must match `desc`; each declared permission must map to a real
  `requestPermission` call; sending user data without disclosure fails review, and handwriting
  counts, so Ink2Pic's `desc` must say that the searched word goes to Openclipart and Wikimedia
  Commons; deletions follow an explicit user action; a public repository speeds the security
  review; Ratta may pull a version after publishing.
- Not found: the submission channel (form, e-mail or program), and any license or content rule.

## Communities

- r/Supernote, about 55,000 members (third-party count of 2026-11-02,
  <https://gummysearch.com/r/Supernote>, snippet). Moderation is reported as strict
  (<https://goodereader.com/blog/commentary/supernote-is-draconian-about-managing-their-reddit-community>,
  snippet). Ink2Task and Clipper were announced there (snippet).
- r/Supernote_dev: where Ratta posts preview builds and developers show plugins (SuperDashboard,
  SuperTemplate, SuperStickyNote) (snippet). Its rules were not readable.
- Ratta's community page lists r/Supernote and a Facebook group
  (<https://supernote.com/pages/join-our-community>, snippet). No official Discord or forum was
  found.

## Curated lists

- `fharper/awesome-supernote`, 647 stars, <https://github.com/fharper/awesome-supernote> (read).
  It has a Plugins section, one line per plugin (a link to the repository, a colon, one sentence), takes additions by
  pull request, and merged plugin entries in January and September 2026.
- «List of All Available Plugins», a post on r/Supernote_dev, updated 2026-09-09, which Ratta's
  help page links (snippet). How entries are added was not readable.
- `dwongdev/sugoi-supernote` was archived on 2026-08-31 (read): not usable.

## How other plugins were announced

Read on GitHub: `LVEVAN/ink2task`, `j-raghavan/sn-dictionary` and `eternauta1337/superclaude` show a
short video or none, numbered install steps through the Partner app, and the topics `supernote`
and `supernote-plugin`. None has a release page with screenshots.

## GitHub search

- Repository search matches the name, description and topics, and the README only with `in:readme`;
  results sort by relevance by default
  (<https://github.com/github/docs/blob/main/content/search-github/searching-on-github/searching-for-repositories.md>,
  read).
- At most 20 topics; topic pages list every repository with the topic
  (`classifying-your-repository-with-topics.md` in `github/docs`, read). About 12 repositories
  carry `supernote-plugin` and about 50 carry `supernote` (`gh search repos --topic`, run).
  Ink2Pic has both.
- The social preview image works best at 1280 x 640 px, under 1 MB
  (`customizing-your-repositorys-social-media-preview.md` in `github/docs`, read).

## Ranked channels

By reach for the owner's time; each waits for the readiness bar named.

| Rank | Channel | Owner time | Ready when |
| --- | --- | --- | --- |
| 1 | InkHub, after Ratta's review ([#28](https://github.com/martonpaulo/ink2pic/issues/28)) | unknown | The MVP of [brief section 9.5](../brief.md#95-definition-of-done-for-the-mvp), `desc` that discloses the network use, least-privilege permissions |
| 2 | Pull request to `fharper/awesome-supernote` ([#29](https://github.com/martonpaulo/ink2pic/issues/29)) | 10 minutes | A release with `Ink2Pic.snplg` attached |
| 3 | Post on r/Supernote_dev, and a request to the plugin list ([#30](https://github.com/martonpaulo/ink2pic/issues/30)) | 25 minutes | The MVP as a prerelease, install steps, a screenshot or short video |
| 4 | Post on r/Supernote ([#30](https://github.com/martonpaulo/ink2pic/issues/30)) | 20 minutes | A stable release, a video or GIF, the firmware it needs |
| 5 | README, topics and preview image ([#26](https://github.com/martonpaulo/ink2pic/issues/26)) | 30 minutes | A device screenshot of the flow |
| 6 | Facebook group | 15 minutes | A stable release |

## Open points

- Ratta's review post, its submission channel, and the plugin list's rules must be read by hand
  on r/Supernote_dev: the research could not reach Reddit ([#28](https://github.com/martonpaulo/ink2pic/issues/28)).
- The Facebook group gets no issue until a stable release exists.
