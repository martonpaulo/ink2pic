# Better keyless picture sources

Date: 2026-11-06. Research for the search-quality work ([#63](https://github.com/martonpaulo/ink2pic/issues/63), [#67](https://github.com/martonpaulo/ink2pic/issues/67), [#71](https://github.com/martonpaulo/ink2pic/issues/71)). Probes ran live from the cloud
session; raw probe output was kept in the session only. Commons and Wikipedia probes were stopped early at the coordinator's request (shared-IP 429s);
what they did not reach is marked UNKNOWN.

Tags: CONFIRMED (seen live here), INFERENCE, UNKNOWN.

## Contents

- [Question](#question)
- [Ranked table](#ranked-table)
- [Evidence per source](#evidence-per-source)
- [Open-source projects with reusable parts](#open-source-projects-with-reusable-parts)
- [Recommendation](#recommendation)
- [Owner decisions this raises](#owner-decisions-this-raises)

## Question

Which keyless sources give better pictures for a 16-gray e-ink note: line art, engravings and
portraits of historical people, and widely recognised symbols for abstract words (cold, idea,
happy)? Constraint found on the way: `insertImage` takes only PNG or JPEG (brief section 4.4),
so an SVG-only source needs a rasterizer on the device.

## Ranked table

| Rank | Source | Keyless | Licence per item | Limits | Fits | Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | OpenMoji black PNG + bundled keyword index | yes | CC BY-SA 4.0, one licence for all | GitHub raw, no documented limit (UNKNOWN) | abstract words, emotions, common objects | add |
| 2 | Wikipedia search lookup (fix, not a new source) | yes | via Commons | Wikimedia limits | people, misspellings | add: replaces the title lookup |
| 3 | Commons query `<name> engraving filetype:bitmap` for people | yes | per file (extmetadata) | Wikimedia limits | engraved portraits | add as a people query |
| 4 | Openverse API | yes | per item, `license` + `attribution` fields | 20/min, 200/day per IP; thumbs 1000/day | museum prints (Rijksmuseum CC0), Flickr Commons | optional, later |
| 5 | Iconify API | yes | per icon set (`collections[].license.spdx`) | none documented | line icons for objects and moods | blocked: SVG only |
| 6 | emojilib (MIT) / CLDR annotations (Unicode-3.0) | data only | n/a | offline | keyword map for symbols | ship as data with OpenMoji |
| 7 | Library of Congress | yes | "Rights status not evaluated" on items | 20 req/min, 1 h block | some engravings | reject |
| 8 | Met Open Access | yes | `isPublicDomain` per object | 1 + N requests per search | poor relevance | reject |
| 9 | Art Institute of Chicago | yes | `is_public_domain` | API 60/min; IIIF host answered a Cloudflare challenge | poor relevance | reject |
| 10 | Internet Archive, Public Domain Vectors, SVG Repo, Old Book Illustrations | - | mixed or missing | challenge or refused | - | reject or UNKNOWN |

## Evidence per source

### OpenMoji (CONFIRMED)

- Data: `https://raw.githubusercontent.com/hfg-gmuend/openmoji/master/data/openmoji.json`,
  2,224,862 B, 4,567 entries; fields `hexcode`, `annotation`, `tags`, `openmoji_tags`, `group`,
  `subgroups`, `skintone`. A trimmed index (no skin tones: 2,527 entries; hexcode, annotation,
  tags, openmoji_tags) is 198,332 B, 56,866 B gzipped. Small enough to ship in the plugin.
- Pictures: `https://raw.githubusercontent.com/hfg-gmuend/openmoji/master/black/618x618/<HEX>.png`,
  PNG 618 x 618, 8-bit palette, 9.5 to 17 KB (`1F976` cold face 16,936 B, `2744` snowflake 9,913 B,
  `1F4A1` light bulb 9,548 B). Black outline on white: viewed `1F976`, clean thick line art.
  Also `color/618x618/`, `black/72x72/`, and `black/svg/` (1 to 3 KB).
- Licence: `LICENSE.txt` is CC BY-SA 4.0; npm `openmoji@17.0.0` says `CC-BY-SA-4.0`.
- `openmoji.org` and the jsDelivr and unpkg CDNs were refused by this session's proxy (UNKNOWN from
  the device).
- Probe, English index (annotation word first, then tags):
  cold 18 hits (cold face, ... ice; snowflake carries tag `cold`), hot 18 (hot face, hot pepper,
  hot beverage), happy 23, sad 23, angry 11, fear 3 (face screaming in fear, fearful face),
  love 44, idea 2 (thought balloon, light bulb), time 31 (hourglass, watch, alarm clock),
  music 25 (musical score, note), apple 6 (red apple, green apple, but also `F8FF` Apple logo and
  `E051` Safari: brand extras must be dropped), soup 2 (pot of food, steaming bowl).
  frio 0, 冷 0 (English only). Napoleon, Cervantes, Lorca: nothing (expected).

### Keyword data for symbols (CONFIRMED)

- emojilib 4.0.3 (MIT): `dist/emoji-en-US.json` 264,699 B, 50,935 B gzipped. Richer English
  keywords: cold → 🧊 🏔 🌡 🌨 ❄ ☃ ⛄; idea → 💡; angry → 😡 💢.
- CLDR annotations, `cldr-annotations-full@49.0.0` (Unicode License V3, permissive with notice):
  en 440,667 B (49,887 gz), pt 453,344 (54,889), es 407,175 (46,316), zh 422,486 (54,908).
  pt frio → 🥶 ⛷ 🐧 🏔 🌨 ❄; pt ideia → 🤔 💭 💡; zh 冷 → 🥶 😓 🧊 🏔 ❄ 💧; es frío hits, es frio
  0 (accents must be folded). Using it accepts non-English words, which the product's non-goal
  «Translate non-English queries» forbids: an owner decision.

### Wikipedia lookup (CONFIRMED)

- Today's Wikidata step lowercases the word, then `wbgetentities&sites=enwiki&titles=`. The lab
  cache holds the live answers: `federico garcía lorca` and `frederico garcía lorca` both return
  `"missing"`. MediaWiki raises only the first letter, so a multi-word name never matches. This is
  why Lorca gets no canonical picture.
- `en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=<word>&gsrlimit=1&prop=pageimages|pageprops&piprop=name&ppprop=wikibase_item`:
  `frederico garcía lorca` → Federico García Lorca, `Lorca_(1914).jpg`, Q41408;
  `miguel de cervantes` → `Cervantes_Jáuregui.jpg`, Q5682; `napoleon` → David's
  *Napoleon in His Study*, Q517; `soup` → Q41415. One request gives the article, its lead image
  and the QID, with spelling tolerance.
- The lead images of Cervantes and Napoleon are oil paintings: the "dark painting" complaint.

### Commons people queries (partly CONFIRMED, rest UNKNOWN)

- Today's `<name> filetype:drawing` for people returns quotes set as text, signatures, medals and
  logos: Cervantes 8 of 8 non-portraits (signature, quote cards, prize medal); Lorca 7 of 7
  (signature, 4 quote cards, 2 airport or poker logos); Napoleon 8 of 8 (emblem, wordmark, coat of
  arms, quote cards, signature). This is the owner's complaint, reproduced.
- `Miguel de Cervantes engraving filetype:bitmap`: 8 results, all portraits or title-page
  engravings (two Rijksmuseum CC0 prints, LoC `cph`, Public domain). Best people result seen.
- `Napoleon engraving filetype:bitmap`: 8, all engravings, mostly scenes, one portrait
  (NIE 1905 after David).
- `Federico García Lorca engraving filetype:bitmap`: 0. A 20th-century person has photos, not
  engravings.
- `haswbstatement:P180=<QID> filetype:bitmap` (depicts): mixed. Napoleon: oil portraits and
  caricatures; Cervantes: stamps, banknote, logo, statue photo, two engravings. Not better than
  the keyword.
- Category search (namespace 14) by name returns unrelated same-name categories; exact category
  names such as "Engravings of X" were not reached: UNKNOWN.

### Openverse (CONFIRMED)

- Response headers: `x-ratelimit-limit-anon_burst: 20/min`, `anon_sustained: 200/day`; thumbnail
  endpoint `anon_thumbnail: 1000/day`. Brief section 5.3 rejected it on a reported 100/day,
  5/hour: that figure is out of date.
- Fields per item: `license`, `license_version`, `license_url`, `creator`, `attribution` (ready
  text), `source`, `category`, `filetype`, `width`, `height`. Filters used: `category=illustration,digitized_artwork`,
  `license=cc0,pdm,by,by-sa`, `source=`. Anonymous `result_count` is capped at 240.
- Thumbnail: 600 x 800 JPEG, 51,643 B.
- Probes: apple, soup, Napoleon (illustration) are Wikimedia SVGs and rawpixel PNGs (soup better
  than Napoleon: flags and coats of arms). Cervantes (cc0, pdm) gives Flickr Commons portraits and
  a Rijksmuseum CC0 engraving. "Federico García Lorca" with accent: 1 result (a quote card);
  without accent: 240, mostly Flickr NC/ND photos. "Frederico": 0. cold: maps of the Cold War.
- Much of it duplicates Commons; it adds Rijksmuseum, Met, Smithsonian, Flickr Commons and
  svgsilh (358,942 CC0 silhouettes with poor titles: soup → "federal", "plain").

### Iconify (CONFIRMED)

- `api.iconify.design/search?query=<w>&limit=64`: 7 to 20 KB JSON with per-set licence.
  `&prefixes=` filters sets. Matches icon names only: Napoleon, Cervantes, Lorca, frio, 冷: 0.
- Good hits: soup → tabler:soup, lucide:soup; cold → ph:thermometer-cold, openmoji:cold-face,
  fluent-emoji-high-contrast:cold-face; angry → tabler:mood-angry; idea → mdi:idea.
- SVG only: `/tabler/soup.svg?height=600` 445 B; `/tabler/soup.png` 404. Needs on-device SVG
  rasterizing (native code, brief section 6).
- Permissive monochrome sets: MIT (tabler, ph, iconoir, fluent-emoji-high-contrast, hugeicons),
  ISC (lucide), Apache-2.0 (mdi, material-symbols, carbon, ic), CC0 (only `cryptocurrency`,
  `logos`). Attribution needed: CC BY 4.0 (solar, streamline*, fa*, twemoji), CC BY 3.0
  (game-icons). ShareAlike: CC BY-SA 4.0 (openmoji, arcticons, typcn). Avoid: GPL (gridicons,
  icomoon-free, et, wordpress), OFL fonts (mdi-light, wi, el) for pictures.

### Rejected (CONFIRMED unless marked)

- Library of Congress: keyless; limits page says 20 requests/min for the JSON API, 1 hour block,
  CAPTCHAs under load. Searches took up to 4.2 s and 30 to 108 KB for 6 results; one transfer cut
  off. Items say "Rights status not evaluated". Lorca 4 hits (posters, a poem), Frederico 0.
- Met: `/public/collection/v1/search` answered 410: "retired on 2026-10-01", use `v1.1/search`
  (offset and limit). Search returns IDs only, so 1 + N requests. apple → ceramic apples,
  Napoleon → Oscar Wilde photographs, Lorca → non-public-domain paintings.
- Art Institute of Chicago: API keyless, `x-ratelimit-limit: 60`; `www.artic.edu/iiif/2/...`
  answered a Cloudflare "Just a moment" page (403) here. Ranking poor: Lorca → studies of Christ.
- Internet Archive: user uploads; most `licenseurl` empty or NC/ND.
- Public Domain Vectors: home 200, `/search?query=` and `/en/search/<q>` answered a Cloudflare
  challenge. SVG Repo: Vercel security checkpoint (429). From a home IP: UNKNOWN.
- Old Book Illustrations, metmuseum.github.io: refused by this session's proxy: UNKNOWN.

## Open-source projects with reusable parts

| Project | Licence | Reuse |
| :--- | :--- | :--- |
| hfg-gmuend/openmoji | CC BY-SA 4.0 | black outline PNGs + tagged index (above) |
| muan/emojilib | MIT | English keyword → emoji map, 51 KB gz |
| milesj/emojibase (emojibase-data 18.0.0) | MIT (data from CLDR) | per-locale `compact.json` (pt 87 KB gz), shortcodes |
| nolanlawson/emoji-picker-element | Apache-2.0 | offline multilingual emoji search over emojibase: search rule to copy |
| iconify/icon-sets (@iconify/json) | MIT packaging, per-set licences | `collections.json` licence table; self-hostable API |
| carolineec/informative-drawings | MIT | photo → line drawing model: too heavy for the device; idea only |
| excalidraw/excalidraw-libraries | MIT | 232 libraries, mostly tech diagrams: nothing to reuse |
| Saber, Rnote (GPL-3.0), tldraw (own licence, not OSS) | - | no image search to reuse |

Not verified: KOReader, Boox or reMarkable tools with image search (GitHub search returned nothing
from this session).

## Recommendation

1. OpenMoji for abstract words and emotions: ship the trimmed index (57 KB gz) with emojilib's
   English keywords merged in; match the word locally; fetch
   `raw.githubusercontent.com/hfg-gmuend/openmoji/master/black/618x618/<HEX>.png`. Drop groups
   `flags`, skin tones and brand extras. Record "OpenMoji, CC BY-SA 4.0". Zero search requests.
2. Wikipedia search for the canonical item: `generator=search&gsrlimit=1&prop=pageimages|pageprops`
   instead of the lowercased title lookup. Fixes Lorca and the misspelling; gives the QID.
3. For a person (the Wikipedia hit has a QID that is a human), query Commons with
   `<article title> engraving filetype:bitmap` before or instead of `filetype:drawing`, and rank
   signatures and text-only files out. UNKNOWN: whether "portrait", "drawing" or "line art" words
   do better; and a darkness test needs the thumbnail.

## Owner decisions this raises

- CC BY-SA 4.0 on inserted pictures (OpenMoji): ShareAlike attaches to the note's picture.
- CLDR or emojibase pt/es/zh keywords would accept non-English words, against a recorded non-goal.
