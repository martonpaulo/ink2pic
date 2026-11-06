/**
 * Device probes for spikes S0, S1 and S3 of brief section 9.1 (issue #3).
 */
import {
  Dimensions,
  NativeModules,
  PixelRatio,
  TurboModuleRegistry,
} from 'react-native';
import {USER_AGENT} from '../config';
import {getLassoElements, getLassoRect, recognizeElements} from '../sdk/lasso';
import {getCurrentFilePath, getCurrentPageNum, getPageSize} from '../sdk/page';
import {
  getDeviceType,
  PERMISSION_INTERNET,
  requestPermission,
} from '../sdk/plugin';
import {describe} from '../sdk/result';
import {
  countDetailLinks,
  countThumbUrls,
  CANDIDATE_MODULES,
  describeModule,
  Section,
} from './report';

const FETCH_TIMEOUT_MS = 10000;
const S3_TITLE = 'S3 recognition';
const OPENCLIPART_SEARCH = 'https://openclipart.org/search/?query=soup';
const OPENCLIPART_IMAGE = 'https://openclipart.org/image/400px/340609';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const COMMONS_QUERY = [
  'action=query',
  'format=json',
  'generator=search',
  'gsrnamespace=6',
  'gsrsearch=soup',
  'gsrlimit=3',
  'prop=imageinfo',
  'iiprop=url|mime|size',
  'iiurlwidth=330',
].join('&');
const COMMONS_SEARCH = `${COMMONS_API}?${COMMONS_QUERY}`;

/**
 * S0: host native modules, layout density, window size, device type. Build 1 showed that
 * `Object.keys(NativeModules)` lists nothing in PluginHost (new architecture), so each candidate
 * is looked up by name, as a TurboModule and as a legacy module.
 */
export async function probeHost(): Promise<Section> {
  const runtime = globalThis as Record<string, unknown>;
  const lines = [
    `NativeModules keys: ${Object.keys(NativeModules).length}`,
    `__turboModuleProxy: ${typeof runtime.__turboModuleProxy}, RN$Bridgeless: ${String(
      runtime.RN$Bridgeless,
    )}`,
  ];
  for (const name of CANDIDATE_MODULES) {
    let turbo: unknown = null;
    try {
      turbo = TurboModuleRegistry.get(name);
    } catch (error) {
      turbo = null;
    }
    const legacy: unknown = NativeModules[name];
    const line = describeModule(name, turbo, legacy);
    if (line) {
      lines.push(line);
    }
  }
  const window = Dimensions.get('window');
  lines.push(`PixelRatio: ${PixelRatio.get()}`);
  lines.push(
    `window: ${window.width} x ${window.height}, scale ${window.scale}`,
  );
  lines.push(`deviceType: ${describe(await getDeviceType(), String)}`);
  return {title: 'S0 host', lines};
}

async function fetchWithTimeout(
  url: string,
  headers: Record<string, string> = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {headers, signal: controller.signal});
  } finally {
    clearTimeout(timer);
  }
}

async function probeUrl(
  label: string,
  url: string,
  read: (response: Response) => Promise<string>,
  headers?: Record<string, string>,
): Promise<string> {
  const started = Date.now();
  try {
    const response = await fetchWithTimeout(url, headers);
    const detail = await read(response);
    return `${label}: HTTP ${response.status}, ${detail}, ${
      Date.now() - started
    } ms`;
  } catch (error) {
    const message =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
    return `${label}: failed after ${Date.now() - started} ms: ${message}`;
  }
}

/** S1: HTTPS fetch to both sources, with the INTERNET permission requested first. */
export async function probeNetwork(): Promise<Section> {
  const permission = await requestPermission(PERMISSION_INTERNET);
  const lines = [`INTERNET permission answer: ${describe(permission, String)}`];
  lines.push(
    await probeUrl('openclipart search', OPENCLIPART_SEARCH, async response => {
      const html = await response.text();
      return `${html.length} chars, ${countDetailLinks(html)} detail links`;
    }),
  );
  lines.push(
    await probeUrl('openclipart 400px', OPENCLIPART_IMAGE, async response => {
      const bytes = (await response.arrayBuffer()).byteLength;
      return `${response.headers.get('content-type')}, ${bytes} bytes`;
    }),
  );
  lines.push(
    await probeUrl(
      'commons search',
      COMMONS_SEARCH,
      async response => {
        const counted = countThumbUrls(await response.text());
        return 'count' in counted ? `${counted.count} thumburl` : counted.error;
      },
      {'User-Agent': USER_AGENT, 'Api-User-Agent': USER_AGENT},
    ),
  );
  lines.push(`User-Agent sent: ${USER_AGENT}`);
  return {title: 'S1 network', lines};
}

/**
 * S3: recognize the lassoed strokes and print the text verbatim. `size` is the note page size:
 * build 1 passed the lasso rect size and every word failed with 117; ink2task and sn-dictionary
 * pass the page size from `getPageSize` [REPORTED].
 */
export async function probeRecognition(): Promise<Section> {
  const elements = await getLassoElements();
  const rect = await getLassoRect();
  const path = await getCurrentFilePath();
  const pageNum = await getCurrentPageNum();
  const lines = [
    `lasso elements: ${describe(elements, e => String(e.length))}`,
    `lasso rect: ${describe(
      rect,
      r => `${r.left},${r.top},${r.right},${r.bottom}`,
    )}`,
    `page: ${describe(pageNum, String)}`,
  ];
  if (!elements.ok || !path.ok || !pageNum.ok) {
    lines.push(
      'recognized: not attempted, the lasso or the page could not be read',
    );
    return {title: S3_TITLE, lines};
  }
  const size = await getPageSize(path.value, pageNum.value);
  lines.push(`page size: ${describe(size, v => `${v.width} x ${v.height}`)}`);
  if (!size.ok) {
    lines.push('recognized: not attempted, no page size');
    return {title: S3_TITLE, lines};
  }
  const text = await recognizeElements(elements.value, size.value);
  lines.push(
    `recognized: ${describe(text, t => `"${t}" (length ${t.length})`)}`,
  );
  return {title: S3_TITLE, lines};
}
