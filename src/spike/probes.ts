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
  hasPermission,
  PERMISSION_FILE_READ,
  PERMISSION_FILE_WRITE,
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
import {brief, log, logged} from '../log/memory';
import {getPluginDirPath} from '../sdk/plugin';
import {SHARED_ROOT} from '../flow/session';
import {downloadToFile, listDir, readText, writeText} from '../storage/files';
import {libraryDir} from '../storage/paths';

const FETCH_TIMEOUT_MS = 10000;
const S3_TITLE = 'S3 recognition';
/** The Manta page in pixels (brief section 2), tried when getPageSize fails. */
const MANTA_PAGE = {width: 1920, height: 2560};
/** Declared in PluginConfig.json `uses-permissions`; FILE:READ gates getPageSize (#3, build 2). */
const NEEDED_PERMISSIONS = [
  PERMISSION_FILE_READ,
  PERMISSION_FILE_WRITE,
  PERMISSION_INTERNET,
];
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

/**
 * Asks for every permission the probes need before any file or note call: touching a path
 * without FILE:READ can close the plugin (j-raghavan/sn-dictionary, device-verified [REPORTED]).
 */
export async function ensurePermissions(): Promise<Section> {
  const lines: string[] = [];
  for (const permission of NEEDED_PERMISSIONS) {
    const has = await logged(`hasPermission(${permission})`, () =>
      hasPermission(permission),
    );
    if (has.ok && has.value) {
      lines.push(`${permission}: granted before`);
      continue;
    }
    const answer = await logged(`requestPermission(${permission})`, () =>
      requestPermission(permission),
    );
    lines.push(`${permission}: answer ${describe(answer, String)}`);
  }
  return {title: 'permissions', lines};
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
  log(`GET ${url}`);
  try {
    const response = await fetchWithTimeout(url, headers);
    const detail = await read(response);
    const line = `${label}: HTTP ${response.status}, ${detail}, ${
      Date.now() - started
    } ms`;
    log(line);
    return line;
  } catch (error) {
    const message =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
    const line = `${label}: failed after ${
      Date.now() - started
    } ms: ${message}`;
    log(line);
    return line;
  }
}

/** S1: HTTPS fetch to both sources; permissions were asked by ensurePermissions. */
export async function probeNetwork(): Promise<Section> {
  const lines: string[] = [];
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
 * S3: recognize the lassoed strokes and print the text verbatim. `size` is the note page size
 * from getPageSize (ink2task and sn-dictionary do this [REPORTED]); when that fails, the known
 * Manta page size is tried, and every attempt is logged.
 */
export async function probeRecognition(): Promise<Section> {
  const lines: string[] = [];
  const elements = await logged('getLassoElements', getLassoElements);
  const rect = await logged('getLassoRect', getLassoRect);
  const path = await logged('getCurrentFilePath', getCurrentFilePath);
  const pageNum = await logged('getCurrentPageNum', getCurrentPageNum);
  lines.push(`lasso elements: ${describe(elements, e => String(e.length))}`);
  lines.push(
    `lasso rect: ${describe(
      rect,
      r => `${r.left},${r.top},${r.right},${r.bottom}`,
    )}`,
  );
  if (elements.ok && elements.value.length > 0) {
    log(`first element keys: ${Object.keys(elements.value[0]).join(',')}`);
    log(`first element: ${brief(elements.value[0], 300)}`);
  }
  if (!elements.ok) {
    lines.push('recognized: not attempted, the lasso could not be read');
    return {title: S3_TITLE, lines};
  }
  const sizes: {label: string; size: {width: number; height: number}}[] = [];
  if (path.ok && pageNum.ok) {
    const pageSize = await logged('getPageSize', () =>
      getPageSize(path.value, pageNum.value),
    );
    if (pageSize.ok) {
      sizes.push({label: 'page size', size: pageSize.value});
    }
  }
  sizes.push({label: 'Manta page', size: MANTA_PAGE});
  for (const {label, size} of sizes) {
    const text = await logged(
      `recognizeElements(${size.width} x ${size.height}, ${label})`,
      () => recognizeElements(elements.value, size),
    );
    lines.push(
      `recognized with ${label} ${size.width} x ${size.height}: ${describe(
        text,
        t => `"${t}" (length ${t.length})`,
      )}`,
    );
    if (text.ok) {
      break;
    }
  }
  return {title: S3_TITLE, lines};
}

/**
 * S2 write (#11): download one Openclipart picture into MyStyle/Ink2Pic/library through the
 * plugin's Java module, check it with listDir, and round-trip a text file in the
 * private plugin directory. Insertion is #12.
 */
export async function probeWrite(): Promise<Section> {
  const lines: string[] = [];
  let turbo: unknown = null;
  try {
    turbo = TurboModuleRegistry.get('Ink2PicFiles');
  } catch (error) {
    log(`TurboModuleRegistry.get(Ink2PicFiles) threw: ${String(error)}`);
  }
  let legacy: unknown = null;
  try {
    legacy = NativeModules.Ink2PicFiles;
  } catch (error) {
    log(`NativeModules.Ink2PicFiles threw: ${String(error)}`);
  }
  const loaded =
    describeModule('Ink2PicFiles', turbo, legacy) ??
    'Ink2PicFiles: not loaded (check reactPackages and restart the device)';
  log(loaded);
  lines.push(loaded);
  const target = `${libraryDir(SHARED_ROOT)}/spike-340609.png`;
  const bytes = await logged(`downloadToFile(${target})`, () =>
    downloadToFile(OPENCLIPART_IMAGE, target),
  );
  lines.push(`download: ${describe(bytes, b => `${b} bytes to ${target}`)}`);
  const listed = await logged('listDir library', () =>
    listDir(libraryDir(SHARED_ROOT)),
  );
  lines.push(
    `in the folder: ${describe(listed, names =>
      String((names ?? []).includes('spike-340609.png')),
    )}`,
  );
  const dir = await logged('getPluginDirPath', getPluginDirPath);
  if (dir.ok) {
    const file = `${dir.value}/spike.json`;
    const text = JSON.stringify({at: new Date().toISOString()});
    const written = await logged('writeText', () => writeText(file, text));
    const read = await logged('readText', () => readText(file));
    lines.push(
      `text file: write ${describe(written, () => 'ok')}, read back ${describe(
        read,
        r => (r === text ? 'same text' : `different: ${brief(r)}`),
      )}`,
    );
  } else {
    lines.push('text file: not attempted, no plugin directory');
  }
  return {title: 'S2 write', lines};
}
