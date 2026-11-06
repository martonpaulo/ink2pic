# The most typical picture first, and the cleanest line art

Date: 2026-11-06. Research for [#66](https://github.com/martonpaulo/ink2pic/issues/66). Owner rules applied: no account, no
server, nothing heavy; page 1 within about 2 s; the 12 thumbnails of pages 1 and 2 are on the
device before page 1 renders. Follows [the ranking research](2026-11-search-ranking.md).

Tags: CONFIRMED (read in a primary source or measured here), REPORTED (search summary or secondary
source; the paper was not read in full), INFERENCE, TO TEST (needs the Manta).

## Contents

- [1. Answer in short](#1-answer-in-short)
- [2. Published methods](#2-published-methods)
- [3. Experiment](#3-experiment)
- [4. Results](#4-results)
- [5. Failure cases seen](#5-failure-cases-seen)
- [6. Cost](#6-cost)
- [7. Recommended scoring](#7-recommended-scoring)
- [8. Limits of this research](#8-limits-of-this-research)
- [9. Sources](#9-sources)

## 1. Answer in short

1. Use one pixel score, **line art**: Ke et al. simplicity (edge-energy box), Athitsos colour
   count, mid-gray share, white share, and a thin-stroke outline term with a solid-fill penalty.
   Re-sort the 12 thumbnails by `titleScore + 3 x lineArt`, `lineArt` min-max normalised within the
   12. The Wikidata picture keeps its place, and a blank thumbnail goes last.
2. On 6 real queries (pages 1 and 2 re-sorted): good pictures on page 1 went from **9 to 15** of 36
   tiles. The first tile was good in 5 of 6 queries instead of 4 [CONFIRMED on this set, one judge].
3. Do not ship VisualRank-style consensus or Berg-style iconicity now. Neither added anything on
   top of line art. Consensus alone promotes the most common style, which on Openclipart is glossy,
   dark clip art; it made `apple` and `cold` worse over 20 results [CONFIRMED on this set].
4. Cost: 1.6 ms of features and 3.5 ms of decoding per thumbnail on a desktop JVM [CONFIRMED],
   about 10 to 50 ms on the Manta [INFERENCE, TO TEST]. The real cost is waiting for 6 more
   thumbnails before page 1 renders.
5. Pixels cannot judge the subject. Wrong-subject line art moves up: the Apple logo outline, a
   decorative frame named "Apple Runner", and lab apparatus named "Cold fingers". Title rules must
   catch these.

## 2. Published methods

| Method | Cheap features it uses | Works on 330 to 400 px gray thumbnails? | Cost | Reference code licence | Tag |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Berg & Berg 2009, "Finding iconic images" (CVPR Workshops, Internet Vision) | Composition: a large object, clearly separated from the background, from proposed object regions; then local-feature appearance clustering to remove off-category images. Learned from labelled Flickr photos | The composition proxies work (border uniformity, object share, centring, largest part). The learned segmentation and local-feature clustering are not light | Proxies: one pass. Original: segmentation plus local features, heavy | None found | REPORTED (abstract, search summaries; PDF host unreachable) |
| Berg & Forsyth 2007, "Automatic ranking of iconic images" (tech report) | Foreground segmentation learned from a few iconic images; ranks by how well the image shows the category. About half of the Flickr images were poor examples | Same as above | Same | None found | REPORTED |
| Jing & Baluja 2008, VisualRank (IEEE TPAMI 30(11)) | Local SIFT descriptors; a visual-similarity graph over the results; PageRank on it. Authority = typical. Tested on 2,000 product queries | Yes with global descriptors (gray histogram, edge-orientation histogram, 4 x 4 grids); SIFT is not light | 12 x 12 matrix: microseconds. Descriptors: one Sobel pass | No author code; GitHub reimplementations have no licence | REPORTED (Google Research page, search summaries). Damping value and candidate count not verified |
| Raguram & Lazebnik 2008, "Computing iconic summaries of general visual concepts" (CVPR Workshops) | GIST plus pLSA topics of tags, joint clustering; a variant of the Ke et al. quality rank picks the representative of each cluster | GIST yes, but clustering needs hundreds of images with tags; 12 results are too few | Gabor bank: moderate | None found | REPORTED |
| Athitsos, Swain & Frankel 1997, photos versus graphics (IEEE CBAIVL) | Number of colours, most frequent colour, farthest-neighbour metric, saturation, size and aspect; decision trees | Yes: colour count is one pass with a 4096-bit set | One pass | None | REPORTED (via US 7,657,089, which calls it "relatively high error rate") |
| Ke, Tang & Jing 2006, high-level features for photo quality (CVPR) | Simplicity: spatial spread of edges (box holding 96.04 % of Laplacian edge energy, that is 98 % per axis), hue count (20 bins), blur, contrast, brightness. 72 % classification, over 90 % precision at low recall | Yes: the edge box and a gray-level count need one pass | One pass | None (a Brown University student reimplementation exists) | REPORTED (abstract; parameters from the student reimplementation) |
| Kang, Lee & Chui 2007, Coherent Line Drawing (NPAR) | Edge tangent flow plus flow-based DoG | Yes, but several times the cost of XDoG | Iterative ETF smoothing: heavy for a plugin | MIT: `SSARCandy/Coherent-Line-Drawing`, `esimov/colidr` (Go) | CONFIRMED licence (GitHub metadata); method REPORTED |
| Winnemöller et al. 2011/2012, XDoG | Two Gaussian blurs, soft threshold | Yes | 97 ms at 960 x 1259 on desktop Java (earlier research) | MIT: `heitorrapela/xdog`, `Kazuhito00/XDoG-OpenCV-Sample`; the method is short enough to write from the paper | CONFIRMED licence (GitHub metadata) |
| Potrace (Selinger) | Bitmap to vector tracing | Not needed: the plugin inserts a bitmap | n/a | GPL-2.0-or-later; "Potrace Professional" is proprietary (Icosasoft). Java port `potracej` is GPL. GPL code in an MIT plugin would bind the whole plugin to the GPL [INFERENCE] | REPORTED (Wikipedia, Potrace README via search) |

Conclusion [INFERENCE]: the iconic-image papers solve "which Flickr photo shows the category
best". Ink2Pic's sources already return mostly centred objects on white, so composition does
not separate good from bad here. What separates them is style (outline versus dark fill) and
subject, and subject needs the title.

## 3. Experiment

- Queries: `apple`, `cold`, `cloudy`, `Miguel de Cervantes`, `cat`, `idea`.
- Sources, as the plugin calls them (`src/sources/*.ts`): the Openclipart search page; the Commons
  `generator=search` with `filetype:drawing`, `gsrlimit=18`, `iiurlwidth=330`, and a plain search
  only when drawings fill less than 6; Wikidata `wbgetentities` P41, P154, P18 as canonical.
  Order: `rankForEink` ported to Python, top 20, thumbnails at 330 px (Commons) and 400 px
  (Openclipart). Commons and Wikidata answered 429 several times and worked after `retry-after`.
- Labels: one judge (the agent), strictly, from gray contact sheets, before any score was seen.
  2 = typical picture of the word, simple, and easy to annotate (outline or light flat fill).
  1 = right subject, but a photo, dark or glossy fill, silhouette, or busy scene. 0 = wrong subject,
  text, logo, map, frame or blank.
- Scores (throwaway Python with numpy; the arithmetic is plain loops, as Java would run it):
  - Consensus: gray histogram (16 bins), edge-orientation histogram (8 bins, Sobel), 4 x 4 grids of
    edge density and mean gray; chi-square and L1 distances; `exp(-d / median d)`; PageRank with
    damping 0.85, uniform teleport. A shape-only variant drops the two gray descriptors.
  - Iconic: border uniformity (outer 6 %), object share (pixels more than 24 gray from the border
    median, best 8 to 55 %), centroid offset, share of the largest part (64 x 64 flood fill).
  - Line art: `0.3 (1 - mid) + 0.2 white + 0.15 (1 - colours) + 0.15 (1 - edgeBox) + 0.2 outline
    - 0.2 solid - 0.2 faint`. `mid` = share of gray 41 to 214; `white` = share of gray 225 or more;
    `colours` = log2 of distinct 12-bit colours, 8 is 0 and 1024 is 1; `edgeBox` = Ke box area;
    `outline` = 1 when ink (gray below 128) is 1 to 30 % and stroke thickness (ink / boundary ink)
    is 4 or less, 0.5 at 8 or less; `solid` when ink is over 25 % and thickness over 15.
- Re-sort: within the 12 thumbnails of pages 1 and 2 (what the device can do), and within all 20
  as an upper bound.

## 4. Results

Good tiles (label 2) on page 1, out of 6, per query; then the totals. Pages 1 and 2 re-sorted.

| Order | apple | cold | cloudy | Cervantes | cat | idea | good@6 (of 36) | label sum@6 | first tile good |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Current `rank.ts` | 2 | 2 | 2 | 0 | 1 | 2 | 9 | 34 | 4 of 6 |
| Consensus only | 2 | 1 | 3 | 0 | 2 | 3 | 11 | 36 | 3 |
| Iconic only | 2 | 1 | 3 | 0 | 0 | 3 | 9 | 35 | 2 |
| Line art only | 2 | 3 | 4 | 0 | 3 | 3 | 15 | 42 | 2 |
| Title + 3 x line art (recommended) | 2 | 3 | 4 | 0 | 3 | 3 | **15** | **42** | **5** |
| Title + 3 x line art + 1 x consensus | | | | | | | 15 | 42 | 5 |
| Title + 3 x consensus | 2 | 2 | 4 | 0 | 2 | 2 | 12 | 38 | 3 |

Over all 20 (upper bound): title + 3 x line art gives 15 good; consensus alone gives 10, and drops
`apple` from 2 to 0 and `cold` from 2 to 0, because the majority style wins. A weight sweep (line
art 0 to 4, consensus 0 to 3, iconic 0 or 1) found no setting where consensus or iconic added a
good tile on top of line art at weight 2 or 3 [CONFIRMED on this set].

Contact sheets (before on top, after below) were rendered in the session for judging and are not kept in the repository.

## 5. Failure cases seen

1. **Wrong-subject line art moves up.** `apple`: the Apple logo outline (Commons "Apple-icon") and
   a decorative frame (Openclipart "Apple Runner") reach page 1. `cold`: "Cold fingers" (lab
   apparatus). A frame could be caught in pixels (ink box touches all four edges, empty centre)
   [INFERENCE]; the logo only by title or source.
2. **Silhouettes.** `rank.ts` gives "silhouette" the line-work bonus, but a silhouette is a solid
   black fill: hard to annotate. 5 of 12 `cat` results are silhouettes. The solid-fill penalty
   moves them down; the title bonus should go [INFERENCE].
3. **Light-gray line art.** "Cat Icon Grey" (lines about gray 160) gets no outline credit, because
   ink is fixed at gray below 128. Use ink = darker than the border median minus 48 [INFERENCE].
4. **Blank tiles.** Commons "Cat silhouette white" is white on transparent, so blank on white.
   Openclipart `https://openclipart.org/image/400px/2370` answers 200 with `content-length: 0`
   [CONFIRMED, 2026-11-06]. Rule: a zero-byte or near-empty thumbnail (object share below 0.5 %)
   goes last.
5. **No good picture to find.** `Miguel de Cervantes`: none of 19 results is a light picture of him.
   Openclipart has 0 results; Commons drawings are quotes, coats of arms, maps and signatures.
   Re-ranking cannot help. The Jáuregui portrait (Wikidata P18) needs the XDoG contour of
   `research-ranking.md` section 5.
6. **Good pictures outside the 12.** `cat`: the four best outline drawings (Commons "Domestic Cat
   Sejant", "Couchant", "Couchant Guardant", NIH BioArt) are at ranks 14 to 19. Only a title rule
   can reach them before the thumbnails load.

## 6. Cost

- Measured [CONFIRMED]: plain Java (`ImageIO`, `getRGB`, loops) on the 118 real thumbnails
  (113,691 pixels on average), Intel Xeon 2.1 GHz, warm JIT: line-art features 1.63 ms per
  thumbnail; decoding plus `getRGB` 3.47 ms. Python with numpy: 24 to 35 ms for every score.
- Manta (RK3566, Cortex-A55 1.8 GHz), ART [INFERENCE, TO TEST]: 5 to 10 times slower, about 10 to
  50 ms per thumbnail, 0.1 to 0.6 s for 12 on one thread, about half with 2 threads. Consensus
  would add one Sobel pass per thumbnail and a 12 x 12 matrix (microseconds).
- Network: page 1 waits for 12 thumbnails instead of 6, which is the larger cost [INFERENCE, TO TEST
  on Wi-Fi].

## 7. Recommended scoring

Starting weights, to calibrate on the 19-word table of brief section 5.5 [INFERENCE]:

1. `key = einkScore(title) + 3 x norm12(lineArt)`; stable sort; canonical results keep their
   place; blank or zero-byte thumbnails last.
2. `lineArt` as in section 3, with ink relative to the border median (failure 3).
3. Remove "silhouette" from `LINE_WORK` and let the solid-fill penalty decide.
4. Add title words for frames and borders (`frame` is already in `STYLISED`; `border`, `runner`,
   `divider` are not) [INFERENCE].
5. Keep consensus and iconicity out. Reopen consensus, shape descriptors only, at weight 1, if a
   larger labelled set shows a gain.

## 8. Limits of this research

- 6 queries, 118 thumbnails, one judge, labels by the agent. The weights are fitted to this set.
- The papers were not read in full: `tamaraberg.com` and `www.fi.muni.cz` do not resolve from this
  session, and the earlier research hit the same block for other paper hosts. Paper claims come
  from abstracts and search summaries.
- Timings are desktop HotSpot, not ART on the Manta.
- Commons and Wikidata answered 429 to this cloud IP; each request waited for `retry-after`.

## 9. Sources

- Berg & Berg, "Finding Iconic Images", CVPR Workshops 2009, doi 10.1109/CVPRW.2009.5204174: `https://mlanthology.org/cvprw/2009/berg2009cvprw-finding`, PDF `https://acberg.com/papers/bb09iv.pdf` (not read).
- Berg & Forsyth, "Automatic Ranking of Iconic Images", UC Berkeley EECS-2007-13: `https://www2.eecs.berkeley.edu/Pubs/TechRpts/2007/EECS-2007-13.html`.
- Jing & Baluja, "VisualRank", IEEE TPAMI 30(11) 1877-1890, 2008, doi 10.1109/TPAMI.2008.121: `https://research.google/pubs/visualrank-applying-pagerank-to-large-scale-image-search/`.
- Raguram & Lazebnik, CVPR Workshops 2008, doi 10.1109/CVPRW.2008.4562959: `https://rahulraguram.github.io/assets/pdf/iconic.pdf` (not read).
- Athitsos, Swain & Frankel, IEEE CBAIVL 1997: `https://crystal.uta.edu/~athitsos/publications/athitsos_cbaivl1997.pdf` (not reachable); US 7,657,089: `https://uspto.report/patent/grant/7,657,089`.
- Ke, Tang & Jing, CVPR 2006: `https://mlanthology.org/cvpr/2006/ke2006cvpr-design/`; student reimplementation `https://cs.brown.edu/courses/cs129/results/final/chenx`.
- Kang, Lee & Chui, NPAR 2007; implementations `github.com/SSARCandy/Coherent-Line-Drawing` (MIT), `github.com/esimov/colidr` (MIT).
- XDoG implementations `github.com/heitorrapela/xdog` (MIT), `github.com/Kazuhito00/XDoG-OpenCV-Sample` (MIT).
- Potrace: `https://en.wikipedia.org/wiki/Potrace`; `github.com/sannysanoff/potracej` (GPL).
- Measurements: throwaway Python and Java, 2026-11-06, not kept.
