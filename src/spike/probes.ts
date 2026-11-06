/**
 * Device probes for spikes S0, S1 and S3 of brief section 9.1 (issue #3).
 */
import {Dimensions, NativeModules, PixelRatio} from 'react-native';
import {USER_AGENT} from '../config';
import {getLassoElements, getLassoRect, recognizeElements} from '../sdk/lasso';
import {
  getDeviceType,
  PERMISSION_INTERNET,
  requestPermission,
} from '../sdk/plugin';
import {describe} from '../sdk/result';
import {
  countDetailLinks,
  countThumbUrls,
  INTERESTING_MODULE,
  Section,
} from './report';

const FETCH_TIMEOUT_MS = 10000;
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

/** S0: host native modules, layout density, window size, device type. */
export async function probeHost(): Promise<Section> {
  const names = Object.keys(NativeModules).sort();
  const lines = [`NativeModules (${names.length}): ${names.join(', ')}`];
  for (const name of names.filter(n => INTERESTING_MODULE.test(n))) {
    const module = NativeModules[name] as Record<string, unknown> | null;
    const methods = module
      ? Object.keys(module).filter(key => typeof module[key] === 'function')
      : [];
    lines.push(`${name}: ${methods.join(', ') || '(no methods)'}`);
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

/** S3: recognize the lassoed strokes and print the text verbatim. */
export async function probeRecognition(): Promise<Section> {
  const elements = await getLassoElements();
  const rect = await getLassoRect();
  const lines = [
    `lasso elements: ${describe(elements, e => String(e.length))}`,
    `lasso rect: ${describe(
      rect,
      r => `${r.left},${r.top},${r.right},${r.bottom}`,
    )}`,
  ];
  if (elements.ok && rect.ok) {
    const size = {
      width: rect.value.right - rect.value.left,
      height: rect.value.bottom - rect.value.top,
    };
    const text = await recognizeElements(elements.value, size);
    lines.push(
      `recognized: ${describe(text, t => `"${t}" (length ${t.length})`)}`,
    );
  } else {
    lines.push('recognized: not attempted, the lasso could not be read');
  }
  return {title: 'S3 recognition', lines};
}
