# Query understanding for people, misspellings and other languages

Date: 2026-11-06. Code read: `src/sources/{wikidata,commons,openclipart,http}.ts`,
`src/search/{search,rank,sources,cache}.ts`, `src/ui/copy.ts`, brief section 5.
Live requests from the cloud session, User-Agent `Ink2Pic/0.1.0 (+https://github.com/martonpaulo/ink2pic)`.
All three hosts answered (commons.wikimedia.org, www.wikidata.org, openclipart.org), and
en/pt/es.wikipedia.org too, but the shared cloud IP got many HTTP 429 (envoy, `retry-after: 9`),
so some cells are UNKNOWN. The search lab's cached responses and its baseline results (the real pipeline over cached
responses, [#63](https://github.com/martonpaulo/ink2pic/issues/63)) were read too.
Raw logs were kept in the session only. Research for [#71](https://github.com/martonpaulo/ink2pic/issues/71) and [#68](https://github.com/martonpaulo/ink2pic/issues/68).

Tags: CONFIRMED = seen in a live or cached response here; INFERENCE = reasoned, not run;
TO TEST = needs a run (device or a calmer IP).

## Contents

- [1. Why García Lorca gives nothing](#1-why-garcía-lorca-gives-nothing)
- [2. Measured entity lookups](#2-measured-entity-lookups)
- [3. Misspellings, prefixes, phrases](#3-misspellings-prefixes-phrases)
- [4. Other languages](#4-other-languages)
- [5. Recommended pipeline](#5-recommended-pipeline)
- [6. Screen copy](#6-screen-copy)
- [7. Open points](#7-open-points)

## 1. Why García Lorca gives nothing

Same result for `Frederico García Lorca`, `Federico García Lorca`, `GARCIA LORCA`: no picture of
the person on any page. Four causes, all CONFIRMED live and in the lab baseline:

1. **Wikidata title lookup lowercases a multi-word name.** `entityUrl` sends
   `titles=federico garcía lorca`; MediaWiki raises only the first letter, so it asks for the
   enwiki page `Federico garcía lorca`, which does not exist. Answer: `{"entities":{"-1":{"missing":""}}}`
   (99 bytes). Same for `frederico …`, `garcia lorca`, `clarice lispector`, `santos dumont`.
   `miguel de cervantes`, `leonardo da vinci`, `napoleon`, `cleopatra` work only because enwiki has
   a lowercase redirect for them. Spelling and accents also matter here: an exact title has no
   fuzziness at all.
2. **The drawings filter fills the page with non-pictures, so the plain search never runs.**
   `Frederico García Lorca filetype:drawing` answers 6 files, `Federico …` 7: one signature SVG,
   four quote posters (`En la bandera de la libertad bordé … - Federico García Lorca, 1898-1936 - gl.svg`),
   `Aena Granada logo.svg` (+ `Poker.org-logo.svg`). 6 >= `PAGE_SIZE`, so `searchCommons` returns
   them and skips the plain search, which has 18 real photos (`Federico García Lorca 2.jpg`, …).
   Spelling does not matter here: CirrusSearch matched `García Lorca` either way.
3. **Openclipart has nothing**: 0 results for every form, and its search is AND over words
   with no fuzziness (`Garcia Lorca` 0, `Lorca` 0).
4. **Ranking keeps the leftovers**: `signature` and `logo` rank last but are still shown, and the
   quote posters are not caught by `STYLISED`. Lab baseline page 1: 4 quote posters, signature, logo.

Not the cause: the 5 s timeout. My first timing (about 5 s for a Commons search) was polluted by
one 429 retry inside the timer; clean requests took 0.15 to 0.8 s. A device log line
`source commons: failed` would prove otherwise [TO TEST].

Cervantes («signatures and dark paintings», CONFIRMED): Wikidata does find Q5682, and its P18 is
`Cervantes Jáuregui.jpg`, an oil portrait; the drawings are a medal, quote posters and
`Miguel de Cervantes signature.svg`. Machado de Assis: lab page 1 starts with
`Assinatura de Machado de Assis` (Portuguese "signature"), which `STYLISED` does not know.

## 2. Measured entity lookups

One request per cell. Size = decoded bytes / gzip bytes on the wire. «-» = not run (stopped to
spare the shared IP).

| Name | Current (`wbgetentities` lowercased title) | `wbsearchentities` en, top 1 | enwiki `list=search`+`generator=search`+pageprops+pageimages (1 request) | `opensearch` top 1 | REST `page/summary/<typed>` | Commons depicts P180, bitmap hits |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Federico García Lorca | missing | Q41408 ✓ | Federico García Lorca, Q41408, `Lorca_(1914).jpg` ✓ | ✓ | ✓ | 49 |
| Frederico García Lorca | missing | Q41408 ✓ | ✓, suggestion `frederico garcia llorca` (useless) | ✓ | ✓ (redirect) | 49 |
| GARCIA LORCA | missing | Q41408 ✓ | ✓ | ✓ | 404 | 49 |
| Miguel de Cervantes | Q5682 ✓ (240 KB / 49 KB gz) | Q5682 ✓ | ✓ `Cervantes_Jáuregui.jpg` | ✓ | ✓ | 99 |
| Napoleon | Q517 ✓ (375 KB / 69 KB gz) | Q517 ✓ | ✓ | ✓ | ✓ | 1054 |
| Frida Kahlo | Q5588 ✓ (197 KB / 37 KB gz) | Q5588 ✓ | ✓ | ✓ | ✓ | 42 |
| Machado de Assis | Q311145 ✓ (155 KB / 28 KB gz) | Q311145 ✓ | ✓ | ✓ | ✓ | 8 |
| Clarice Lispector | missing | Q235955 ✓ | ✓ | ✓ | ✓ | 19 |
| Santos Dumont | missing | ✗ town Q1754760 first, person 2nd | Alberto Santos-Dumont, Q313211 ✓ | - | - | - |
| Cleopatra | Q635 ✓ (lab cache) | - | - | - | - | - |
| Leonardo da Vinci | Q762 ✓ (lab cache) | - | - | - | - | - |

Sizes per request (CONFIRMED): `wbsearchentities` 1.1-1.7 KB / ~450 B gz; the enwiki combined
search 470-580 B / ~300 B gz; opensearch 100-370 B; REST summary 2.4-3.3 KB / ~0.9 KB gz;
`wbgetentities props=claims` for a person 147-375 KB / 25-69 KB gz (the current request 1).

Found the person: current code 6 of 11 forms; `wbsearchentities` 8 of 9 run; enwiki combined
search 9 of 9 run; opensearch 8 of 8; REST summary 7 of 8 (needs a near-exact title).

Other approaches:

- **WCQS** (commons-query.wikimedia.org): 307 to `Special:OAuth/authenticate`. Needs a login,
  so not keyless. Rejected (CONFIRMED).
- **Commons category of the person** (Wikidata P373): the top category holds places, family and
  works, not portraits (Lorca: 26 subcategories, none named Portraits/Drawings/Signatures; Cervantes
  13, none). Needs the claims (large) and a second walk. Not worth it (CONFIRMED for 7 people).
- **Commons depicts** `haswbstatement:P180=<Q> filetype:bitmap`: 8 to 1054 files, mostly real
  portraits and photos, plus a few signatures (`Clarice-Lispector-Unterschrift.png`). With
  `filetype:drawing`: 0 to 6, mostly flags and coats of arms. So depicts is the source of the
  real portrait, not of a line drawing (CONFIRMED).
- **Line drawing of a person**: Openclipart has some (Frida Kahlo 7, Napoleon 23, Cleopatra 19,
  Leonardo 41 but many «AI Generated», Machado de Assis 1; Lorca, Cervantes, Clarice, Santos Dumont 0).
  Commons engravings of old figures are JPG bitmaps; whether `depicts + engraving|lithograph|gravure`
  finds them is TO TEST.
- **Signature property P109** is set on all 7 people measured: `… signature.svg`,
  `Frida Kahlo signature firma.svg`, `Assinatura de Machado de Assis.png`,
  `Clarice-Lispector-Unterschrift.png`. File names use English, Spanish, Portuguese and German words.

## 3. Misspellings, prefixes, phrases

| Query | Commons suggestion (combined request) | enwiki top hit | enwiki suggestion | `wbsearchentities` en |
| :--- | :--- | :--- | :--- | :--- |
| Instituto Conficio | `instituto confúcio` ✓ | UNKNOWN (429) | UNKNOWN | UNKNOWN; pt: none |
| Frederico García Lorca | - | Federico García Lorca ✓ | `frederico garcia llorca` ✗ | Q41408 ✓ |
| Napolean | - | Napoleon ✓ | `napoleon` ✓ | UNKNOWN |
| Leonardo da Vinchi | - | Leonardo da Vinci ✓ | `leonardo da vinci` ✓ | ✗ (a Bulgarian club) |
| Cervantez | - | Miguel de Cervantes ✓ | `cervantes` ✓ (es too) | ✗ (family name) |
| Machado de Asis | - | UNKNOWN | UNKNOWN | UNKNOWN |
| appel | - | UNKNOWN | UNKNOWN | ✗ (family name) |
| cofee | - | UNKNOWN | UNKNOWN | ✗ (a street artist) |
| elefant | - | `Elefant` (wrong page) | `elephant` ✓ | UNKNOWN |
| beutiful | - | junk page | `beautiful` ✓ | UNKNOWN |

CONFIRMED:

- **The plugin's current Commons request returns no suggestion.** In generator mode
  (`generator=search`) the API sends no `searchinfo`: the lab's cached `elephent filetype:drawing`
  answer is exactly `{"batchcomplete":true}`, and none of 76 cached Commons searches has a
  `searchinfo`. This differs from the coordinator's note. Adding
  `list=search&srsearch=<same>&srnamespace=6&srlimit=1&srinfo=suggestion|totalhits&srprop=`
  to the **same** request returns it: `Instituto Conficio filetype:drawing` answered 0 pages and
  `{"totalhits":0,"suggestion":"instituto confúcio filetype:drawing"}` in 0.54 s. One request, no
  extra. The suggestion carries the filter, which must be removed before the query is shown again.
- **Wikipedia's suggestion** (`srinfo=suggestion`) fixed 5 of 6 measured misspellings; its top hit
  alone found every misspelled name. It fails on names it has to rewrite many words of
  (`frederico garcia llorca`). It comes free in the entity request of section 5.
- **Wikidata `wbsearchentities` is a prefix search on labels and aliases, not a spell checker**:
  `Machado de A` → Q311145, `Garcia Lor` → Q41408 (CONFIRMED), but `Cervantez`, `appel`, `cofee`,
  `Leonardo da Vinchi` all went to the wrong item. `elephan`, `Confuc`, `thermom`: UNKNOWN (429).
- **Commons wildcard** `elephan* filetype:drawing`: 1062 hits in 0.22 s, all elephants.
  CirrusSearch fuzzy `word~` was not run (429 budget).
- **Phrase back-off**: Openclipart is AND over words with no prefix match (`velho relógio de parede`
  0, `relógio` 8, `big red apple` 4, `red apple` 114, `wall clock` 22, `elephan` 0).
  `wbsearchentities` for `big red apple` (en) and `Instituto Conficio` (pt): no item.

## 4. Other languages

`wbsearchentities` with `uselang=en` returns the item's English label in `display.label`, so one
request maps the word to an English search word (CONFIRMED).

| Word | `language=en` top 1 | `language=<its own>` top 1 |
| :--- | :--- | :--- |
| maçã (pt) | ✗ macaque Q618026 | UNKNOWN (429) |
| sopa (pt) | ✗ family name | ✓ Q41415 «soup» |
| manzana (es) | ✗ family name | ✓ Q89 «apple» (2nd: city block) |
| perro (es) | ✗ genus of spiders | UNKNOWN |
| 苹果 (zh) | ✓ Q89 «apple» (matched zh-cn) | ✓ Q89 |
| 鲁迅 (zh) | ✓ Q23114 «Lu Xun» (matched zh-cn) | ✓ Q23114 |
| cachorro, cadeira (pt), 狗 (zh) | UNKNOWN | UNKNOWN |

The current enwiki title lookup also picks English homographs (lab cache, CONFIRMED):
`sopa` → SOPA, `manzana` → «Manzana», `perro` → «Perro», `cachorro` → «Bear Cub», `silla` → «Silla»;
`maçã`, `cadeira`, `苹果`, `狗` → nothing.

So **"English first, others only when English finds nothing" is wrong for Latin script**: English
finds something (a family name, a genus) for most Portuguese and Spanish nouns. For Han script,
English-first works because there is no English match (CONFIRMED for 2 words).

## 5. Recommended pipeline

Today: Openclipart 1 + Commons drawings 1 (+1 plain) + Wikidata 1 + Commons files 1.

0. **Normalise** (no request): NFC, newlines and repeated spaces to one space, trim punctuation.
   Keep the typed case for display; never lowercase for a lookup (search APIs ignore case).
1. **Entity request** (replaces `wbgetentities`, same count, about 1/150 of the bytes): on the
   Wikipedia of the query language, `action=query&list=search&srsearch=<q>&srlimit=1&srinfo=suggestion&srprop=&generator=search&gsrsearch=<q>&gsrlimit=1&prop=pageprops|pageimages&ppprop=wikibase_item|disambiguation&piprop=original|name&redirects=1`.
   Gives title, QID, lead image (the portrait) and a «did you mean», in ~300 B gz. CONFIRMED on 9
   names and 4 misspellings. Language: Han script → `zh` (or `wbsearchentities`); Latin script →
   the owner's languages in a fixed order, which is an owner decision (`ç ã õ` hint pt, `ñ` es: INFERENCE).
2. **Commons drawings request** with the `list=search` suggestion added (0 extra).
3. **For a person** (the entity has a QID and its lead image exists; a stronger test needs P31, TO TEST):
   the portrait = lead image / P18; the gallery = `haswbstatement:P180=<Q> filetype:bitmap` (+1),
   instead of the drawings search; line drawings from Openclipart. Rank `engraving|lithograph|drawing|gravure`
   titles first among depicts results to avoid dark paintings (TO TEST).
4. **Fix the page-fill test**: a drawing counts toward `PAGE_SIZE` only if it is not stylised and
   names the subject as its plain subject; otherwise run the plain search (CONFIRMED needed for Lorca).
5. **Drop signatures, do not rank them**: the P109 file when known, and file names or titles
   matching `signature|signatur|firma|assinatura|unterschrift|autograph`.

Fallback ladder when page 1 has no usable picture, cheapest first, stop at the first that finds,
**at most 3 extra requests per search**:

| Step | Requests | Source of the new word |
| :--- | :--- | :--- |
| a. Commons suggestion | +2 (re-run Openclipart + Commons) | already in request 2 |
| b. Wikipedia did-you-mean or top-hit title | +2, only if a gave nothing | already in request 1 |
| c. Wikidata prefix (`wbsearchentities`, English label) | +1 lookup, re-run counts against the cap | cut words, other language |
| d. Phrase back-off: longest word not in a stop list | +2 | the query itself |

With the cap, only one of a, b, d runs a full re-search (2), plus at most one c lookup (1).

## 6. Screen copy

- A corrected search shows, above the grid: «Showing results for **Instituto Confúcio**.» and a
  button «Search for Instituto Conficio instead» that runs the typed word with no correction.
  The same line for a shorter phrase («Showing results for relógio.») and for a translated label
  («Showing results for apple.»). One line, on page 1 only; the typed word stays in the box.
- `search.empty` («No pictures found. Try a simpler English word.») no longer fits once pt, es and zh
  are understood. Proposal: «No pictures found. Check the spelling or try one word.»
  Strings go in `src/ui/copy.ts`.

## 7. Open points

- Every UNKNOWN cell above (429 on the shared IP).
- `wbsearchentities language=pt` fallback to English labels for an English word: not run.
- Whether the device can read the system language to pick the Wikipedia: TO TEST.
- CirrusSearch fuzzy `~` on Commons and Wikipedia: not run.
- Engravings of old figures through depicts plus title words: TO TEST.
