/**
 * Renders every screen as the Manta shows it, 1920 x 2560 px in 16 grey levels, to
 * .scratch/renders/<screen>.png, and fails on any e-ink rule break (brief section 8.4, #80):
 * text contrast under the floor, a target under the touch target, text under the minimum font
 * size (#85), text outside its box, or animation. Run with `npm run renders` before each device
 * build; RENDER_SCALE=1 renders 1024 x 1365 px pictures for a quick look. Uses the Chromium installed with Playwright.
 */
import fs from 'fs';
import path from 'path';
import {act} from 'react-test-renderer';
import {metrics} from '../../src/ui/metrics';
import {animationBreaks, toHtml, WINDOW} from './html';
import {breaksOf, Measured} from './rules';
import {fixtureLog, SCREENS, settle} from './screens';

/** The few Playwright calls used here; Playwright is installed with Chromium, not in package.json. */
type Page = {
  setContent: (html: string, options: {waitUntil: 'load'}) => Promise<void>;
  evaluate: <T>(expression: string) => Promise<T>;
  screenshot: (options: {path: string}) => Promise<void>;
};
type Browser = {
  newPage: (options: object) => Promise<Page>;
  close: () => Promise<void>;
};
const {chromium} = require('playwright') as {
  chromium: {launch: () => Promise<Browser>};
};

const OUT = path.join(__dirname, '../../.scratch/renders');
const MANTA_SCALE = 1.875;
const scale = Number(process.env.RENDER_SCALE ?? MANTA_SCALE);
/**
 * A function that runs in the page, read as text so Babel never rewrites it: the shared
 * rendered-contrast check (interface standard rule 3), copied unchanged, and the measurer.
 */
const inPage = (file: string, name: string, args = '') =>
  `(() => { ${fs
    .readFileSync(path.join(__dirname, file), 'utf8')
    .replace(`export function ${name}`, `function ${name}`)}; return ${name}(${args}); })()`;
const MEASURE = inPage('measure-page.mjs', 'measurePage');
const CONTRAST = inPage('contrast-check.mjs', 'contrastCheck', '{focusRings: false}');

type ContrastResult = {
  failures: {kind: string; text?: string; ratio: number; required: number}[];
  unmeasured: {kind: string; selector: string; reason: string}[];
};

let browser: Browser;
let page: Page;

beforeAll(async () => {
  fs.mkdirSync(OUT, {recursive: true});
  browser = await chromium.launch();
  page = await browser.newPage({
    viewport: {
      width: Math.round(WINDOW.width * scale),
      height: Math.round(WINDOW.height * scale),
    },
    deviceScaleFactor: 1,
  });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  fixtureLog();
});
afterAll(async () => {
  await browser?.close();
  jest.restoreAllMocks();
});

it('renders every screen and finds no e-ink rule break (#80)', async () => {
  const report: Record<string, string[]> = {};
  for (const screen of SCREENS) {
    const tree = await screen.render();
    const json = tree.toJSON();
    await page.setContent(toHtml(json, scale), {waitUntil: 'load'});
    await page.screenshot({path: path.join(OUT, `${screen.name}.png`)});
    const measured = await page.evaluate<Measured>(MEASURE);
    const contrast = await page.evaluate<ContrastResult>(CONTRAST);
    report[screen.name] = [
      ...animationBreaks(json),
      ...breaksOf(measured, metrics),
      ...contrast.failures.map(
        f => `contrast ${f.ratio}:1 under ${f.required}:1 for «${f.text ?? f.kind}»`,
      ),
      ...contrast.unmeasured.map(u => `contrast not measured: ${u.reason}`),
    ];
    await act(async () => {
      tree.unmount();
      settle();
    });
  }
  fs.writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 1)}\n`);
  const lines = Object.entries(report).flatMap(([name, found]) =>
    found.map(line => `${name}: ${line}`),
  );
  process.stdout.write(
    `renders: ${SCREENS.length} screens in ${OUT}\n${lines.join('\n') || 'renders: no e-ink rule break'}\n`,
  );
  expect(lines).toEqual([]);
});
