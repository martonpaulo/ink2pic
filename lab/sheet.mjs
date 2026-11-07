#!/usr/bin/env node
/**
 * Contact sheets of a run (#63): each query's page 1 as the app's 2 x 3 grid, in grayscale as
 * on e-ink, with each tile's title, source and score, and what its pixels say: its kind, and the
 * contour drawing the device shows in its place when it converts it (#81). Rendered to PNG with the Playwright and
 * Chromium the machine already has, `QUERIES_PER_SHEET` queries per image, into
 * `out/<run>/sheets/`.
 *
 *   node lab/sheet.mjs <run>
 */
import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {
  CACHE_DIR,
  checkProxy,
  pageOneThumbs,
  readResults,
  ROOT_DIR,
  runDir,
} from './lib.mjs';

const QUERIES_PER_SHEET = 8;
const SHEET_WIDTH = 1300;
/** The first view; the screenshot takes the full page. */
const VIEWPORT_HEIGHT = 800;
const DIGITS = 2;

const HTML_ENTITIES = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'};
const escape = text => String(text).replace(/[&<>"]/g, c => HTML_ENTITIES[c]);

const STYLE = `
body { margin: 0; padding: 16px; background: #fff; color: #000; width: ${SHEET_WIDTH}px;
  font: 13px/1.3 system-ui, sans-serif; box-sizing: border-box; }
.sheet { display: grid; grid-template-columns: 1fr 1fr; gap: 20px 24px; }
.case { border: 1px solid #000; padding: 8px; }
.case h2 { margin: 0; font-size: 16px; }
.case p { margin: 2px 0 6px; color: #333; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.tile { border: 1px solid #999; padding: 4px; min-width: 0; }
.tile .img { height: 170px; display: flex; align-items: center; justify-content: center; }
.tile img { max-width: 100%; max-height: 170px; filter: grayscale(1); }
.tile .title { font-size: 11px; height: 28px; overflow: hidden; word-break: break-word; }
.tile .meta { font-size: 11px; color: #444; }
.empty { padding: 40px; text-align: center; border: 1px dashed #000; }
`;

/** The tile's place on page 1 (0-based, as `flags` in a judgment names it) and its signals. */
function tileHtml(tile, place, files) {
  // The device shows a converted picture as its contour drawing (#81).
  const file = tile.pixels?.file ?? files.get(tile.thumb);
  const picture = file
    ? `<img src="${escape(pathToFileURL(file))}">`
    : '<span>no thumbnail</span>';
  const score = tile.canonical ? 'canonical' : `score ${tile.score}`;
  const format = (tile.mime ?? '').replace('image/', '');
  const pixels = tile.pixels
    ? `${tile.pixels.kind}${tile.pixels.converted ? ' → contour' : ''}${
        tile.pixels.darkened ? ' → darkened' : ''
      } · line ${tile.pixels.lineArt}`
    : 'not measured';
  return `<div class="tile"><div class="img">${picture}</div>
<div class="title">${escape(tile.title)}</div>
<div class="meta">[${place}] ${escape(tile.source)} · ${escape(
    format,
  )} · ${score}<br>${escape(pixels)}</div></div>`;
}

function caseHtml(entry, number, files) {
  const failed = Object.entries(entry.statuses)
    .filter(([, status]) => status.state === 'failed')
    .map(([source, status]) => `${source} ${status.kind}`);
  const grid = entry.page1.length
    ? `<div class="grid">${entry.page1
        .map((t, place) => tileHtml(t, place, files))
        .join('')}</div>`
    : '<div class="empty">empty page</div>';
  return `<div class="case"><h2>${number}. ${escape(entry.id)}: «${escape(
    entry.query,
  )}»</h2>
<p>${escape(entry.category)}, ${entry.total} results${
    failed.length ? `, failed: ${escape(failed.join(', '))}` : ''
  }.
Screen line: «${escape(entry.notice?.text ?? 'none')}». Expect: ${escape(
    entry.expect,
  )}</p>${grid}</div>`;
}

checkProxy();
const name = process.argv[2];
const results = readResults(name);
const files = await pageOneThumbs(results);
const outDir = path.join(runDir(name), 'sheets');
const htmlDir = path.join(CACHE_DIR, 'sheets', name);
fs.mkdirSync(outDir, {recursive: true});
fs.mkdirSync(htmlDir, {recursive: true});

// The preinstalled Playwright lives outside the project: resolved through NODE_PATH.
const {chromium} = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: {width: SHEET_WIDTH, height: VIEWPORT_HEIGHT},
  });
  for (
    let start = 0;
    start < results.cases.length;
    start += QUERIES_PER_SHEET
  ) {
    const cases = results.cases.slice(start, start + QUERIES_PER_SHEET);
    const number = String(start / QUERIES_PER_SHEET + 1).padStart(DIGITS, '0');
    const body = cases
      .map((entry, i) => caseHtml(entry, start + i + 1, files))
      .join('');
    const html = path.join(htmlDir, `sheet-${number}.html`);
    fs.writeFileSync(
      html,
      `<!doctype html><meta charset="utf-8"><style>${STYLE}</style><div class="sheet">${body}</div>`,
    );
    await page.goto(pathToFileURL(html).href, {waitUntil: 'load'});
    const png = path.join(outDir, `sheet-${number}.png`);
    await page.screenshot({path: png, fullPage: true});
    console.log(path.relative(ROOT_DIR, png));
  }
} finally {
  await browser.close();
}
