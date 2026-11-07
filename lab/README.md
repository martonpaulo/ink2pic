# Search lab

The search lab judges the picture search and its ranking on a computer, without the Supernote
([#63](https://github.com/martonpaulo/ink2pic/issues/63)). It runs the product's own search code
over a fixed catalogue of queries against the live sources, and keeps evidence that a person and
an agent can compare before and after a change.

The lab is not part of the plugin: the bundle holds only what `index.js` imports, and `jest`
ignores `lab/`. Nothing here runs in `npm run validate`.

## What it needs

- Node 22.21 or later. Behind a proxy (`HTTPS_PROXY` set, as in a cloud session), add
  `NODE_USE_ENV_PROXY=1` to every command, so Node's `fetch` uses the proxy; the scripts stop
  with this message when it is missing.
- The project's `node_modules` (`npm ci`): the scripts transpile the TypeScript with the
  `typescript` devDependency, through `ts-hook.cjs`.
- Python 3 with Pillow, for the pixel measures of `metrics.mjs`.
- A JDK (`javac` and `java`), for the device's pixel step (below).
- Playwright with Chromium, installed outside the project and found through `NODE_PATH`, for the
  sheets.

## Run it

```bash
node lab/run.mjs baseline       # every case, into lab/out/baseline/results.json
node lab/sheet.mjs baseline     # contact sheets, into lab/out/baseline/sheets/*.png
node lab/metrics.mjs baseline   # numbers, into lab/out/baseline/metrics.json
```

`run.mjs` (through `runner.mjs`) calls the search core's `searchAll` over `DEFAULT_ADAPTERS`,
with the context the device builds, without the device's search cache, breaker and thumbnail
store, so each query is judged on its own. Then it takes the device's pixel step
([#66](https://github.com/martonpaulo/ink2pic/issues/66), [#81](https://github.com/martonpaulo/ink2pic/issues/81)), in `pixelorder.mjs`: the
thumbnails of pages 1 and 2 are measured by the plugin's own `ThumbMeasures.java`, compiled from
`native/src` with `LabPixels.java`, which decodes with ImageIO in place of Android; a picture that
`needsContour` names is replaced by its contour drawing from the plugin's `Decolor.java` and
`Contour.java`, unless the drawing `isSpeckled`; faint line work is replaced by its darkened copy
(`EinkPixels.darken`); the search core's `reorderByMeasures` re-sorts them; and
`dropNearDuplicates` leaves out near-duplicates by the plugin's `PerceptualHash.java`. Pages 1 and 2 in `results.json` are in the order
the device shows, and each tile's `pixels` holds its kind, its line-art score and the file it
shows. It asks one query at a time, with the app's
User-Agent and a pause after each query that reached the network. A query whose source was
throttled or did not answer is asked again once, 5 seconds later, and is then kept as it failed:
`statuses`, `attempts`, `seconds` and `waited` in `results.json` say what happened. The script ends
with the queries that still have a failed source. Run it again with the same name: every answer
already received comes from the cache, so only the failed requests reach the network. Wikimedia
answers HTTP 429 when many clients share one address, as cloud sessions do; two or three passes
are then normal.

## Inject faults

The search must keep working when a source stops, hangs or throttles. `--fault` replaces one
source's fetch in the lab, never in the product:

```bash
node lab/run.mjs commons-throttled --fault commons=429,wikidata=slow
node lab/faults.mjs baseline    # every single-source fault, into lab/out/baseline/faults.json
```

| Kind | What the source's fetch does |
| :--- | :--- |
| `down` | Rejects at once, as with no connection. |
| `slow` | Never answers, until the source's own timeout aborts it. |
| `throttled` or `429` | Answers HTTP 429. |
| `broken` or `500` | Answers HTTP 500. |
| `malformed` | Answers 200 with an outage page instead of its usual body. |

The sources are `openclipart`, `commons` and `wikidata`. `faults.mjs` runs every case once with
no fault and once per source and kind, the other sources answering from the cache of an earlier
`run.mjs` of the same name. Per fault it counts the queries that still fill page 1, fill it in
part or leave it empty, and which line the search screen shows. `notice` in `runner.mjs` copies
the screen's rule; a change to that rule changes the copy too.

## Files

| File | What it holds |
| :--- | :--- |
| `cases.json` | The catalogue: each query's `id`, `category`, `query` and `expect`, what a good page 1 holds. |
| `out/<run>/results.json` | Not committed, since a picture title can read as private data to the commit scanner. Pages 1 and 2 of each query: id, source, title, MIME type, thumbnail URL, canonical flag and score, with each source's status and the screen's line. |
| `out/baseline/` | The first run, at 82c29a4, before the search core: `judgment.json`, `metrics.json` and `faults.json`. |
| `out/<run>/judgment.json` | A person's verdict per query, written by hand (below). |
| `out/<run>/metrics.json` | The numbers `metrics.mjs` writes. |
| `out/<run>/faults.json` | The numbers `faults.mjs` writes. |
| `out/<run>/sheets/sheet-NN.png` | Page 1 of eight queries per image, in the app's 2 x 3 grid, in grayscale; not committed, about 8 MB a run. |
| `pixelorder.mjs`, `LabPixels.java` | The device's pixel step: measures, contour drawing and order. |
| `out/.cache/` | Raw source responses, thumbnails with their contour drawings, the compiled Java and sheet pages; not committed. |

## Judge a run

Look at every sheet, then write `out/<run>/judgment.json`, one entry per case id:

```json
{
  "apple": {
    "ok": false,
    "reason": "two logos before the first fruit",
    "flags": {"logo": [1, 3], "text": [5]}
  }
}
```

`ok` is true only when page 1 holds what `expect` says, in its order where `expect` names one.
`reason` is one line. `flags` lists tiles by their 0-based place on page 1: `text` for a picture
that is only text, the one kind the script cannot see; `signature`, `logo` and `dark` add to what
it reads from the titles and the pixels.

## Compare two runs

1. Change the code under `src/`.
2. `node lab/run.mjs after`, `node lab/sheet.mjs after`.
3. `node lab/metrics.mjs baseline after` prints both runs' numbers, then each query whose page 1,
   verdict or counts changed. A run without its `results.json`, such as the baseline in a fresh
   clone, is read from its committed `metrics.json`.
4. Copy the judgment of each unchanged query from the baseline, and judge the changed ones from the
   sheets.

The raw responses stay in `out/.cache/`, so a ranking change sees the same source answers as the
baseline did. A change to a source's request asks the network only for the new URLs. Delete
`out/.cache/raw/` to ask the sources again.
