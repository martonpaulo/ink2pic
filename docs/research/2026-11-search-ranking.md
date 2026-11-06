# ranking results for e-ink, pixel measures, contour conversion

Date: 2026-11-06. Research for the search-quality work measured in the search lab ([#63](https://github.com/martonpaulo/ink2pic/issues/63)). Owner rule applied: no account, no
server, nothing heavy; titles and metadata plus cheap pixel measures in plain Java.

Tags: CONFIRMED (read in a primary source or measured here), REPORTED (secondary source or search
summary, paper not read in full), INFERENCE, TO TEST (needs the Manta).

## Contents

- [1. Answer in short](#1-answer-in-short)
- [2. What similar products do](#2-what-similar-products-do)
- [3. Pixel measures and their cost](#3-pixel-measures-and-their-cost)
- [4. Experiment on real thumbnails](#4-experiment-on-real-thumbnails)
- [5. Contour conversion on the device](#5-contour-conversion-on-the-device)
- [6. Query intent: style words in the query](#6-query-intent-style-words-in-the-query)
- [7. Proposed scoring](#7-proposed-scoring)
- [8. Considered and rejected](#8-considered-and-rejected)
- [9. Open points and limits of this research](#9-open-points-and-limits-of-this-research)
- [10. Sources](#10-sources)

## 1. Answer in short

1. Keep the title rules; add a query-intent step: a style word the person wrote (logo, flag, map,
   signature, text, photo) stops being a penalty and becomes a small bonus.
2. Add five pixel classes, computed in Java on each thumbnail file already on disk: too dark,
   photo-like, text or signature, outline, clean white background. Cost on this machine: 1 to 7 ms
   per 330 to 400 px thumbnail with every measure, connected components included [CONFIRMED,
   desktop JVM]; about 5 to 10 times more on the Manta's Cortex-A55 [INFERENCE].
3. Convert photos and dark paintings to contours with XDoG, plain Java, no library: 97 ms for a
   960 x 1259 portrait on this machine, 4 float buffers of 4.8 MB [CONFIRMED, desktop]. Run it at
   the insert width (600 to 700 px), not 960: about half the pixels, about 9 MB [INFERENCE].
   On the Manta about 0.3 to 0.7 s [INFERENCE, TO TEST].

## 2. What similar products do

| Product | What it does | Signal type | Tag |
| :--- | :--- | :--- | :--- |
| Microsoft 365 Insert > Stock Images | Separate tabs: Images, Icons, Cutout People, Stickers, Illustrations, Cartoon People. The style is chosen by the person through a tab, from a curated library, not detected | Curation plus a style facet | REPORTED (Microsoft support pages via search) |
| Google Images | «Type» filter with Clip art and Line drawing since December 2008, computed from the image content by Google | Content classifier exposed as a filter | REPORTED (Google blog 2008, via search; current UI may differ) |
| Bing Images | Shows a «transparent background» toggle on some logo queries | Query intent shows a style facet | REPORTED (Search Engine Roundtable 2023) |
| Noun Project | Style filters «solid / line» and line weight | Style facet | REPORTED (search summary of its blog; page not reachable) |
| Openverse | Elasticsearch BM25; title match boosted 10,000 times over description and tags; a `rank_feature` on provider popularity (`standardized_popularity`), optional `authority_boost`; keyword filters for category (photograph, illustration, digitized artwork), aspect ratio, size, extension. No pixel-based quality signal | Text relevance, popularity, metadata filters | CONFIRMED (`documentation/api/reference/search_algorithm.md` and `api/api/controllers/search_controller.py`, WordPress/openverse main, read 2026-11-06) |
| Boox, reMarkable, Kindle Scribe | Insert a picture from local storage or cloud import; none searches the web for pictures | None | REPORTED (Boox help center via search; no Kindle Scribe source found) |
| Coloring-page tools | Photo to line art with Canny, Sobel or contours; XDoG in ComfyUI preprocessors and several open implementations | Edge filters | REPORTED |

Academic work on «graphic versus photo»: Athitsos, Swain and Frankel (1997) separate web graphics
from photographs with simple metrics such as the number of colours [REPORTED, paper not reachable
from this session]; a 2010 Microsoft patent lists number of colours, most frequent colour, a
farthest-neighbour metric and saturation for the same task [REPORTED]. Lienhart and Hartmann (2002)
classify web images into photos, graphics, comics and slides [REPORTED, title only].

Conclusion [INFERENCE]: products that serve «a picture to put in a document» either curate one
style (Office icons) or give the person a style facet (Google, Noun Project). Ink2Pic has neither
a curated library nor room for a filter control in the e-ink flow, so the style must be inferred
from title, metadata and pixels, which is what section 7 proposes.

## 3. Pixel measures and their cost

All measures run on the thumbnail already written to the private folder (330 px Commons,
400 px Openclipart), on gray values flattened on white with the same luma as `EinkPixels.luminance`.
Costs are one pass over about 130,000 pixels unless noted.

| Measure | Definition used here | Separates | Source of the method | Cost |
| :--- | :--- | :--- | :--- | :--- |
| Mean luminance | mean of gray | dark paintings, night scenes | standard | 1 pass, with the next three |
| Dark ratio | share of gray < 80 | dark pictures; also red fills (a red apple is about 60 gray) | standard | same pass |
| White ratio | share of gray >= 225 | line art on white | standard | same pass |
| Mid-gray ratio | 1 - dark - white | photos, paintings, gradients (muddy on 16 grays) | standard | same pass |
| Border white | share of near-white pixels in the outer 5 % frame | clip art and line art on white versus photos and paintings | INFERENCE (cheap proxy for «isolated subject») | under 20 % of a pass |
| Colour count | distinct 12-bit colours of opaque pixels | graphics versus photos | Athitsos et al. 1997 [REPORTED] | same pass, a 4096-bit set |
| Edge density | share of pixels with Sobel L1 magnitude > 128 | busy line art and halftone versus flat fills | Sobel operator, standard | 1 pass, 3 x 3 |
| Ink ratio and ink box | share of gray < 128; tight box around them | how much the picture prints | standard | 1 pass |
| Line aspect | ink-box width / (ink-box height / number of text bands) | one or more lines of writing, signatures | horizontal projection profile, standard in document layout analysis [INFERENCE: textbook method, no paper read] | 1 pass over the box |
| Stroke width estimate | 2 x ink pixels / boundary ink pixels | thin uniform strokes (writing) versus fills | cheap stand-in for the Stroke Width Transform, Epshtein, Ofek and Wexler, CVPR 2010 [REPORTED] | 1 pass |
| Connected components | 8-neighbour flood fill on ink; count, largest share, heights | text (many small similar parts) versus one connected drawing | standard; signature detection by contour saliency is Zhu et al., CVPR 2007 [REPORTED] | 1 pass plus an int array of w x h |
| Image aspect | width / height of the file | wide strips: signatures, wordmarks, one-line text | Openverse filters on aspect ratio [CONFIRMED]; Commons already returns `width` and `height` with `iiprop=size` [CONFIRMED in `src/sources/commons.ts`] | zero for Commons; bounds decode for Openclipart |

Measured total for every measure above, connected components included: mean 3.5 ms, range 0.7 to
7.2 ms per thumbnail, desktop HotSpot JIT on an Intel Xeon 2.1 GHz [CONFIRMED]. The Manta has a
Rockchip RK3566, four Cortex-A55 at 1.8 GHz [REPORTED, Supernote product page via
search]. A factor of 5 to 10 gives about 20 to 70 ms per thumbnail, 0.1 to 0.4 s for six on the
worker thread [INFERENCE, TO TEST]. The rules in section 7 need no connected components; without
them the cost drops by about half [INFERENCE].

## 4. Experiment on real thumbnails

28 real thumbnails: 24 from Openclipart at 400 px, 4 from Commons (Cervantes by Jáuregui, Mona Lisa,
Rembrandt self-portrait, Einstein signature). Labels by looking at a contact sheet. Throwaway Java
(`javax.imageio`, the same arithmetic as the Android code would use), removed after the run.

| Thumbnail | Label | mean | dark | white | mid | border | edge | ink | line aspect |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Cervantes (Jáuregui) | dark painting | 35 | 0.79 | 0.00 | 0.21 | 0.00 | 0.12 | 0.84 | 0.76 |
| Mona Lisa | dark painting | 74 | 0.58 | 0.00 | 0.42 | 0.00 | 0.09 | 0.82 | 0.67 |
| Rembrandt self-portrait | dark painting | 32 | 0.97 | 0.00 | 0.03 | 0.00 | 0.03 | 0.98 | 0.77 |
| Deep night cityscape | dark | 26 | 0.85 | 0.00 | 0.15 | 0.00 | 0.05 | 0.91 | 1.41 |
| Cat silhouette on green | dark background | 45 | 0.99 | 0.01 | 0.00 | 0.00 | 0.02 | 0.99 | 0.83 |
| Night scene (framed) | dark illustration | 142 | 0.21 | 0.31 | 0.48 | 1.00 | 0.06 | 0.49 | 2.00 |
| Jesse Jackson photo | photo | 104 | 0.38 | 0.00 | 0.62 | 0.00 | 0.11 | 0.56 | 0.70 |
| Einstein signature | signature | 235 | 0.06 | 0.89 | 0.05 | 0.96 | 0.22 | 0.08 | 6.88 |
| Bach signature | signature | 233 | 0.08 | 0.89 | 0.03 | 1.00 | 0.17 | 0.09 | 5.17 |
| MLK signature | signature | 237 | 0.06 | 0.90 | 0.04 | 0.98 | 0.17 | 0.07 | 3.06 |
| Fake signature (thick) | signature | 211 | 0.17 | 0.80 | 0.02 | 0.96 | 0.13 | 0.18 | 1.95 |
| Humorous quote | text | 224 | 0.10 | 0.84 | 0.06 | 0.88 | 0.24 | 0.13 | 15.3 |
| Nature quote | text | 228 | 0.10 | 0.87 | 0.03 | 1.00 | 0.14 | 0.11 | 4.95 |
| Night School | text | 227 | 0.09 | 0.85 | 0.06 | 0.97 | 0.27 | 0.11 | 5.16 |
| Script word | text | 212 | 0.18 | 0.79 | 0.03 | 1.00 | 0.17 | 0.19 | 6.34 |
| VEGAN in a circle | text | 241 | 0.06 | 0.91 | 0.03 | 0.90 | 0.09 | 0.07 | 1.00 |
| 3D letters | text | 186 | 0.17 | 0.49 | 0.33 | 0.98 | 0.06 | 0.18 | 1.25 |
| Wilhelm Busch self-portrait | line art | 209 | 0.16 | 0.78 | 0.06 | 0.95 | 0.28 | 0.18 | 0.81 |
| Elf coloring page | outline | 227 | 0.10 | 0.85 | 0.05 | 0.91 | 0.23 | 0.11 | 0.88 |
| Man with accordion | line art | 199 | 0.17 | 0.69 | 0.14 | 0.87 | 0.40 | 0.22 | 0.83 |
| Anatomy line art | faint outline | 251 | 0.00 | 0.94 | 0.06 | 0.96 | 0.11 | 0.00 | 0.45 |
| Gandhi halftone | halftone | 195 | 0.09 | 0.44 | 0.48 | 0.72 | 0.50 | 0.19 | 1.32 |
| Man walks dog | silhouette | 181 | 0.28 | 0.70 | 0.02 | 0.88 | 0.10 | 0.29 | 1.72 |
| Apple core | clip art | 162 | 0.32 | 0.46 | 0.21 | 0.85 | 0.07 | 0.33 | 0.76 |
| Simple red apple | clip art | 135 | 0.64 | 0.31 | 0.05 | 0.69 | 0.03 | 0.66 | 0.93 |
| Glossy apple | clip art | 141 | 0.46 | 0.33 | 0.21 | 0.81 | 0.04 | 0.54 | 1.74 |
| Apple (realistic) | clip art | 121 | 0.46 | 0.26 | 0.29 | 0.76 | 0.04 | 0.68 | 0.98 |
| Apple svg | clip art | 136 | 0.48 | 0.35 | 0.16 | 0.82 | 0.07 | 0.62 | 0.65 |

Rules from section 7 on this set [CONFIRMED on these 28, INFERENCE beyond them]:

- Too dark (`mean < 100` and `border < 0.30`): 5 of 5 dark pictures flagged; no clip art or line
  art flagged. The framed night scene is missed (white frame).
- Photo-like (`border < 0.30` and `mid >= 0.40`, not too dark): the photo flagged.
- Text or signature (`border >= 0.85`, `ink < 0.25`, line aspect `>= 2.5`): 7 of 10 flagged;
  missed: the thick fake signature (1.95), VEGAN in a circle, 3D letters. No good picture flagged
  (highest good line aspect: 1.74). The titles of the three misses already say «Signature»,
  «word», «3D».
- Outline (`border >= 0.85`, `white >= 0.60`, `dark <= 0.20`, not text): Busch, elf, accordion,
  anatomy flagged; one false positive: VEGAN in a circle.
- A red apple prints as dark gray (luma about 60): dark ratio alone would punish good clip art,
  which is why «too dark» needs the border test.
- The anatomy drawing has ink ratio 0.00: its lines are lighter than 128 and may fade on e-ink.
  A «too faint» flag (`ink < 0.01` and `white > 0.9`) is worth a test [INFERENCE].

## 5. Contour conversion on the device

Methods tried in plain Java on Cervantes (960 x 1259), Jesse Jackson (559 x 800) and Rembrandt,
after a 1 %/99 % histogram stretch (dark paintings use a narrow gray range):

| Method | Result seen | Desktop time, 960 x 1259 | Notes |
| :--- | :--- | ---: | :--- |
| XDoG, tau form, `sigma 1.0, k 1.6, tau 0.98, eps 0, phi 200` | best: clean contours of face, collar and suit; some speckle on the old canvas | 97 ms | Winnemöller, Kyprianidis and Olsen 2012 [REPORTED] |
| XDoG soft (`sigma 1.6, phi 20`) | too faint for e-ink | about 100 ms | |
| Adaptive threshold (Bradley-Roth, integral image, window 31, t 0.12) | woodcut look; strong on the photo, blotchy on the dark painting | 18 to 33 ms | needs a `double` integral image (8 bytes per pixel) |
| Sobel magnitude, two levels | thick, noisy outlines | 54 to 60 ms | |
| Canny (Canny 1986) | not run; non-maximum suppression and hysteresis add two passes and give 1 px lines that may vanish when scaled down [INFERENCE] | | |
| Flow-based DoG (Kang, Lee and Chui, NPAR 2007) | not run; best published line quality, but needs an edge tangent flow field, several times the cost of XDoG [REPORTED] | | |

Recommendation [INFERENCE, TO TEST on the device]:

1. XDoG with the sharp parameters, after the histogram stretch, as a new step in
   `Ink2PicImageModule.prepare`, before `EinkPixels.toEink`.
2. Run it at the output width (600 to 700 px, brief section 7), not at 960: about 0.5 MP,
   4 float arrays of about 2.2 MB, about 9 MB, about 45 ms on the desktop.
3. Remove speckle: drop ink components smaller than about 8 px, one flood-fill pass.
4. Apply it only to pictures the measures call too dark or photo-like, and to every picture when
   the query asks for an outline [owner decision needed: automatic, or a choice at insert].
5. The same filter on the 330 px thumbnail costs about 5 ms on the desktop, so the grid could show
   the converted thumbnail, as brief section 7 already wants for gray thumbnails [TO TEST cost].
6. The `int[]` of `getPixels` and the bitmap add about 2 x 4 bytes per pixel; peak about 13 MB at
   650 px [INFERENCE].

## 6. Query intent: style words in the query

Today `STYLISED` costs 5 points even when the person asked for that style: «apple logo» ranks every
Apple logo below plain apples.

Proposed rule [INFERENCE; no primary source found that documents a search engine's rule]:

1. Split the query into subject words and style words. Style words are the words of the existing
   lists (`LINE_WORK`, `PHOTO`, `STYLISED`) plus `text`, `word`, `lettering`, `quote`, `painting`,
   `portrait`.
2. Subject words decide the subject score, as today. A title missing a style word still counts:
   «Apple» answers «apple logo», but below «Apple logo».
3. A style word in the query cancels the penalty of its own group and adds +2 to titles that carry
   it; the pixel penalty of the matching class is cancelled too (`signature` cancels the
   text-or-signature penalty; `painting` or `photo` cancels too dark and photo-like, and skips the
   contour conversion).
4. Line-work words in the query (`outline`, `drawing`, `silhouette`) raise the line-work and outline
   bonus from +1 and +2 to +2 and +3.
5. With a style word, Commons should search without `filetype:drawing` when the style is `photo` or
   `painting` [INFERENCE].
6. Wikidata: a `logo` query could read P154 of the subject's item; for «apple logo» the item of
   «apple» is the fruit, so this helps only when the subject is the company [INFERENCE, out of scope].

Precedent: Bing shows its transparent-background toggle on logo queries [REPORTED], and Openverse
treats style as a filter (category), not as a word to match [CONFIRMED]; both read the style as a
constraint, not as a topic.

## 7. Proposed scoring

Same integer scale as `src/search/rank.ts` (plain subject +3, mention +1, line-work word +1,
Openclipart or PNG/SVG +1, photo word -1, stylised -5). Starting weights [INFERENCE, to calibrate
with the 19-word table of brief section 5.5 plus 5 people and 5 style queries]:

| Signal | Source | Weight |
| :--- | :--- | ---: |
| Plain subject in title | title | +3 (unchanged) |
| Word in a longer title | title | +1 (unchanged) |
| Line-work word in title | title | +1 (+2 when the query asks for line work) |
| Openclipart, or PNG/SVG on Commons | metadata | +1 (unchanged) |
| Photo word in title | title | -1 (0 when the query asks for a photo) |
| Stylised word in title | title | -5, but +2 when the query names that style |
| Text words in title (`text`, `word`, `quote`, `lettering`, `typography`) | title | -4 (new; 0 when asked) |
| Image aspect > 3 (Commons metadata, before download) | metadata | -1 |
| Outline (pixels) | thumbnail | +2 |
| Clean white background, not outline (`border >= 0.85`) | thumbnail | +1 |
| Too dark (`mean < 100`, `border < 0.30`) | thumbnail | -4; -1 when contour conversion is on |
| Photo-like (`border < 0.30`, `mid >= 0.40`) | thumbnail | -1; 0 when contour conversion is on |
| Text or signature (`border >= 0.85`, `ink < 0.25`, line aspect >= 2.5) | thumbnail | -4 (0 when asked) |

Where pixel scores fit the flow [INFERENCE]: thumbnails are downloaded per page, but ranking
happens before. Measure the thumbnails of pages 1 and 2 (12 files) before page 1 renders, re-sort
those 12, and measure each later page as it loads. Page 2 needs those files anyway; the cost is
the wait for 6 more thumbnails before the first render. A canonical Wikidata picture keeps its
place regardless of pixels (brief section 5.5, rule 4).

## 8. Considered and rejected

- Mobile CLIP-type models (MobileCLIP, TinyCLIP, SigLIP small) and any ML runtime (TFLite, ONNX
  Runtime, PyTorch Mobile): rejected by the owner on 2026-11-06, too heavy for the plugin; not
  researched further.
- A trained small classifier on the pixel features: possible later with the same features, but
  needs a labelled set; the rules above are the first step.

## 9. Open points and limits of this research

- Sample: 28 thumbnails, labelled by one person (the agent) from a contact sheet. Thresholds are
  fitted to them; treat them as starting values.
- Timings are desktop HotSpot; ART on a Cortex-A55 is not measured [TO TEST: log the time of
  measures and XDoG on the device].
- The Commons and Wikipedia APIs answered HTTP 429 to this cloud session; Commons pictures came
  from `upload.wikimedia.org` at predefined widths. No Commons search was run.
- Papers (Athitsos 1997, Winnemöller 2012, Epshtein 2010, Zhu 2007, Kang 2007) were not reachable
  from this session (proxy 403); their claims here come from search summaries [REPORTED].
- Openclipart thumbnails come in many modes (P, LA, RGBA); `BitmapFactory` with ARGB_8888
  normalises them, as the Java test did with `getRGB`.
- Commons `extmetadata` may carry `Categories` (for example signature categories), a zero-cost
  signal; not checked because the API was throttled [TO TEST].

## 10. Sources

- Openverse search algorithm: `https://github.com/WordPress/openverse/blob/main/documentation/api/reference/search_algorithm.md`, and `api/api/controllers/search_controller.py` lines 260 to 306 (rank_feature, title boost 10000), read 2026-11-06.
- Microsoft support, «Insert images, icons, and more in Microsoft 365»: `https://support.microsoft.com/topic/c7b78cdf-2503-4993-8664-851085c30fce`; «Find and insert clip art»: `https://support.microsoft.com/en-us/office/find-and-insert-clip-art-1b5f134a-1e0f-4646-8828-164dfb22638b` (via search).
- Google blog, new search-by-style options, 2008: `https://googleblog.blogspot.com/2008/12/new-search-by-style-options-for-google.html` (via search).
- Bing transparent toggle: `https://www.seroundtable.com/bing-transparent-toggle-35189.html` (via search).
- Boox handwritten notes: `https://help.boox.com/hc/en-us/articles/10701578837268-Handwritten-Notes` (via search).
- Athitsos, Swain, Frankel, «Distinguishing photographs and graphics on the World Wide Web», IEEE CBAIVL 1997: `https://crystal.uta.edu/~athitsos/publications/athitsos_cbaivl1997.pdf` (not reachable); US patent 7,657,089: `https://uspto.report/patent/grant/7,657,089`.
- Winnemöller, Kyprianidis, Olsen, «XDoG: An eXtended difference-of-Gaussians compendium», Computers & Graphics 36(6), 2012: `https://users.cs.northwestern.edu/~sco590/winnemoeller-cag2012.pdf` (not reachable).
- Kang, Lee, Chui, «Coherent Line Drawing», NPAR 2007: `https://umsl.edu/cmpsci/about/People/Faculty/HenryKang/coon.pdf`.
- Epshtein, Ofek, Wexler, «Detecting Text in Natural Scenes with Stroke Width Transform», CVPR 2010: `https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/201020CVPR20TextDetection.pdf`.
- Zhu, Zheng, Doermann, Jaeger, «Multi-scale Structural Saliency for Signature Detection», CVPR 2007: `https://mlanthology.org/cvpr/2007/zhu2007cvpr-multi-a`.
- Supernote Manta: `https://supernote.com/products/supernote-manta` (via search: RK3566, 4 x 1.8 GHz, 4 GB).
- Measurements: throwaway Java in the session scratchpad, 2026-11-06, removed.
