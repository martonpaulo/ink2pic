/**
 * PluginHost simulator (#78): a stateful fake of sn-plugin-lib 0.2.3 and of the host behind it,
 * so whole flows run in Jest. It keeps one note page (elements with type, rect, numInPage, uuid,
 * text, picture), the lasso, the pen events, the permissions, the plugin view (shown, hidden,
 * destroyed), the SDK's event caches and listeners, a file store with shared and private storage
 * for the plugin's own modules Ink2PicFiles and Ink2PicImage, the network behind `fetch`, and a
 * virtual clock.
 *
 * It installs into the jest mock in __mocks__/sn-plugin-lib.ts by giving each jest.fn() an
 * implementation, so suites that set their own answers keep working. Every host rule it follows
 * is in ./rules.ts with its source and tag; a test in __tests__/pluginHost.test.ts guards each.
 * It is a test tool only: it proves the code against what we know of the host, never instead of
 * the device check.
 */
import {readFileSync} from 'fs';
import {join} from 'path';

export type Rect = {left: number; top: number; right: number; bottom: number};
export type Size = {width: number; height: number};

/** The answer shape of every PluginCommAPI, PluginNoteAPI and PluginFileAPI call (rule apiResponse). */
export type ApiResponse<T> = {
  success: boolean;
  result: T | null;
  error: {code: number; message: string} | null;
};

export function success<T>(result: T): ApiResponse<T> {
  return {success: true, result, error: null};
}

export function failure(code: number, message: string): ApiResponse<never> {
  return {success: false, result: null, error: {code, message}};
}

/** How long the SDK keeps the last button, config and life message for a late listener (rule replay). */
export const REPLAY_MS = 1000;
/** Lifecycle states (sn-plugin-lib 0.2.3 src/PluginManager.ts). */
export const LIFE = {
  mounted: 1,
  start: 2,
  stop: 3,
  unmounted: 4,
  destroyed: 5,
} as const;
/** Button press values: 3 is a click (docs/research/2026-11-pluginhost-sdk.md (d)). */
const CLICK = 3;
export const STROKE_TYPE = 0;
export const PICTURE_TYPE = 200;
/** `getDeviceType()` of the A5X2 Manta (brief section 4.1). */
const MANTA = 5;
/** The Manta's page in Android pixels: getPageSize answered 1920 x 2560 (build 0.1.0 (3)). */
export const MANTA_PAGE: Size = {width: 1920, height: 2560};
/** insertImage's smallest and largest side (rule insertImage). */
export const MIN_SIDE = 100;
export const MAX_SIDE = 2560;

export const ERROR = {
  recognition: {code: 117, message: 'Recognition failed. Please try again!'},
  readNotRequested: {
    code: 1503,
    message: 'File read permission has not been requested',
  },
  noLasso: {code: 904, message: 'not in lasso context'},
} as const;

export const PERMISSION = {
  internet: 'plugin.permission.INTERNET',
  read: 'plugin.permission.FILE:READ',
  write: 'plugin.permission.FILE:WRITE',
  delete: 'plugin.permission.FILE:DELETE',
} as const;
/** The answers of hasPermission and requestPermission (brief section 3.6). */
export const GRANT = {denied: 0, once: 1, always: 2, cancelled: -1} as const;

/** Synthetic paths: a note and the private folder, never the owner's. */
export const SHARED_ROOT = '/storage/emulated/0';
export const NOTE_PATH = `${SHARED_ROOT}/Note/example.note`;
export const PLUGIN_DIR =
  '/data/user/0/com.ratta.supernote.pluginhost/files/plugins/simulated';

const FIXTURES = join(__dirname, '..', 'fixtures');

export type HostElement = {
  uuid: string;
  type: number;
  numInPage: number;
  pageNum: number;
  layerNum: number;
  rect: Rect;
  /** What the person wrote, for the recognition; strokes only. */
  text?: string;
  picture?: {picturePath: string; rect: Rect};
};

type FileEntry = {
  text?: string;
  image?: Size;
  bytes: number;
  order: number;
  /** Written by a download cut off midway: no PNG end (#91). */
  truncated?: true;
};

type Channel = 'button' | 'life' | 'config';
type ButtonListener = {onButtonPress: (msg: unknown) => void};
type LifeListener = {onMsg: (msg: unknown) => void};
type ConfigListener = {onClick: () => void};
type AnyListener = ButtonListener | LifeListener | ConfigListener;
type Request = {permission: string; resolve: (answer: number) => void};
type Call = {api: string; name: string; args: unknown[]; at: number};
type Answer = (...args: unknown[]) => unknown;
type Impl = (...args: any[]) => unknown;

/** A fake response with what the search core reads: status, ok and text. */
export type FakeResponse = {
  status: number;
  ok: boolean;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
};

export type HostOptions = {
  pageSize?: Size;
  page?: number;
  /** Grants already given, by permission: 0 never, 1 once, 2 always. */
  granted?: Partial<Record<string, number>>;
  /** The person's answer to a permission dialog, or `wait` until answerDialog. */
  dialog?: number | 'wait';
  /** TO TEST (#73): whether the lasso lassoElements made survives closePluginView. */
  lassoSurvivesClose?: boolean;
  /**
   * How the plugin's own module writes a shared file: `in-place` as ModuleWork.java does since
   * #62, or `replace` (a temporary file renamed over it) as before.
   */
  moduleWrites?: 'in-place' | 'replace';
};

/** A line-art thumbnail's measures (the `outline` values of __tests__/measures.test.ts). */
const LINE_ART = {
  mean: 227,
  dark: 0.1,
  white: 0.85,
  mid: 0.05,
  border: 0.91,
  borderMedian: 255,
  ink: 0.11,
  inkLeft: 0,
  inkTop: 0,
  inkWidth: 300,
  inkHeight: 320,
  bands: 1,
  lineAspect: 0.9,
  thickness: 2.5,
  edge: 0.23,
  edgeBox: 0.6,
  colours: 12,
  objectShare: 0.12,
  fragments: 0.05,
  darkest: 0,
  faintLines: false,
  ms: 2,
};
/** The size of a downloaded picture and of a thumbnail, before any preparation. */
const DOWNLOAD_SIZE: Size = {width: 800, height: 600};
const THUMB_SIZE: Size = {width: 400, height: 300};
const DOWNLOAD_BYTES = 24197;

function moduleError(code: string, message: string): Error {
  return Object.assign(new Error(message), {code});
}

function inside(inner: Rect, outer: Rect): boolean {
  return (
    inner.left >= outer.left &&
    inner.top >= outer.top &&
    inner.right <= outer.right &&
    inner.bottom <= outer.bottom
  );
}

function union(rects: Rect[]): Rect {
  return {
    left: Math.min(...rects.map(r => r.left)),
    top: Math.min(...rects.map(r => r.top)),
    right: Math.max(...rects.map(r => r.right)),
    bottom: Math.max(...rects.map(r => r.bottom)),
  };
}

function hostOf(url: string): string {
  return /^https?:\/\/([^/?#]+)/.exec(url)?.[1] ?? '';
}

function parentOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/'));
}

export function isShared(path: string): boolean {
  return path.startsWith('/storage/') || path.startsWith('/sdcard/');
}

/** The search sources' answers, from the fixtures the adapter tests use. */
function fixtureFor(url: string): string | null {
  const host = hostOf(url);
  if (host === 'openclipart.org') {
    return 'openclipart-soup.html';
  }
  if (host === 'commons.wikimedia.org') {
    return url.includes('titles=') ? 'commons-files.json' : 'commons-soup.json';
  }
  if (host.endsWith('.wikipedia.org')) {
    // A written line's titles check (#87), else the lookup's search.
    return url.includes('titles=')
      ? 'wikipedia-titles.json'
      : 'wikipedia-hit.json';
  }
  if (host === 'www.wikidata.org') {
    return 'wikidata-entity.json';
  }
  return null;
}

export class PluginHost {
  now = 0;
  view: 'hidden' | 'shown' | 'destroyed' = 'hidden';
  readonly pageSize: Size;
  page: number;
  elements: HostElement[] = [];
  lasso: {uuids: string[]; rect: Rect} | null = null;
  /** Every SDK, module and network call, in order. */
  readonly calls: Call[] = [];
  /** What the host sent: `button <id>`, `life <state>`, `config`; `lost …` before init. */
  readonly sent: string[] = [];
  readonly buttons: unknown[][] = [];
  readonly files = new Map<string, FileEntry>();
  readonly folders = new Set<string>();
  readonly requests: string[] = [];
  online = true;
  /** Hosts, or exact URLs, that answer this HTTP status, for one failing source or file. */
  readonly failing = new Map<string, number>();
  /**
   * Hosts whose downloads are cut off midway, leaving half the file written in place (#91):
   * `error` rejects as the stream ends early, `silent` resolves as a closed connection may.
   */
  readonly cutOff = new Map<string, 'error' | 'silent'>();
  /** The words the recognition gives for the lassoed strokes, in page order. */
  recognize: (words: string[]) => string = words => words.join(' ');
  dialog: number | 'wait';
  lassoSurvivesClose: boolean;
  moduleWrites: 'in-place' | 'replace';

  private initialized = false;
  private readonly grants = new Map<string, number>();
  private readonly denied = new Set<string>();
  private readonly cache: Record<Channel, {msg: unknown; at: number} | null> = {
    button: null,
    life: null,
    config: null,
  };
  private readonly listeners: Record<Channel, Set<AnyListener>> = {
    button: new Set(),
    life: new Set(),
    config: new Set(),
  };
  private readonly penUp = new Set<{onMsg: (msg: unknown) => void}>();
  private readonly motion = new Set<{onMsg: (msg: unknown) => void}>();
  private readonly dialogs: Request[] = [];
  private readonly parked: Request[] = [];
  private readonly answers = new Map<string, Answer[]>();
  private serial = 0;
  private writes = 0;

  constructor(options: HostOptions = {}) {
    this.pageSize = options.pageSize ?? MANTA_PAGE;
    this.page = options.page ?? 0;
    this.dialog = options.dialog ?? GRANT.always;
    this.lassoSurvivesClose = options.lassoSurvivesClose ?? true;
    this.moduleWrites = options.moduleWrites ?? 'in-place';
    for (const [permission, grant] of Object.entries(options.granted ?? {})) {
      this.grants.set(permission, grant ?? GRANT.denied);
    }
  }

  // ---- The person and the host ----

  advance(ms: number): void {
    this.now += ms;
  }

  grant(permission: string, answer: number): void {
    this.grants.set(permission, answer);
  }

  granted(permission: string): number {
    return this.grants.get(permission) ?? GRANT.denied;
  }

  /** Every permission PluginConfig.json declares, allowed always. */
  grantDeclared(): void {
    const config = JSON.parse(
      readFileSync(join(__dirname, '..', '..', 'PluginConfig.json'), 'utf8'),
    ) as {'uses-permissions': string[]};
    for (const permission of config['uses-permissions']) {
      this.grant(permission, GRANT.always);
    }
  }

  /** The person writes `text` with the pen inside `rect`; listeners get its pen-up. */
  write(text: string, rect: Rect): HostElement {
    const element: HostElement = {
      uuid: `stroke-${++this.serial}`,
      type: STROKE_TYPE,
      numInPage: this.elements.length,
      pageNum: this.page,
      layerNum: 0,
      rect,
      text,
    };
    this.elements.push(element);
    this.penUp.forEach(listener => listener.onMsg([this.toSdk(element)]));
    return element;
  }

  /** The person lassoes what lies inside `rect`; by default everything on the page. */
  lassoAround(rect: Rect = {left: 0, top: 0, ...this.corner()}): void {
    const chosen = this.elements.filter(element => inside(element.rect, rect));
    this.lasso =
      chosen.length > 0
        ? {
            uuids: chosen.map(element => element.uuid),
            rect: union(chosen.map(element => element.rect)),
          }
        : null;
  }

  /**
   * A press: the button event, then lifecycle 2, as a pair (rule pressPair); a button registered
   * with showType 0 sends the event only (rule noView).
   */
  press(id: number): void {
    this.send('button', {id, pressEvent: CLICK});
    const button = this.buttons.find(
      args => (args[2] as {id?: number} | undefined)?.id === id,
    );
    if ((button?.[2] as {showType?: number} | undefined)?.showType !== 0) {
      this.show();
    }
  }

  /** The person turns to page `page`; the lasso ends with it (rule lassoEnds). */
  turnPage(page: number): void {
    this.page = page;
    this.lasso = null;
  }

  /** The Note app paused or the file changed: hidden, with no lifecycle event (rule silentHide). */
  hideSilently(): void {
    this.view = 'hidden';
    this.lasso = null;
    this.cancelDialogs();
  }

  /** A config-button tap (rule replay covers its cache too). */
  tapConfig(): void {
    this.send('config', {});
  }

  /** The person answers the dialog that waits, oldest first. */
  answerDialog(answer: number): void {
    const request = this.dialogs.shift();
    if (request) {
      this.settle(request, answer);
    }
  }

  /** Requests waiting for the person or for the view. */
  waiting(): {dialogs: number; parked: number} {
    return {dialogs: this.dialogs.length, parked: this.parked.length};
  }

  /** The next calls to `name` answer with these functions, in order, before the simulator does. */
  script(name: string, ...answers: Answer[]): void {
    this.answers.set(name, [...(this.answers.get(name) ?? []), ...answers]);
  }

  called(name: string): Call[] {
    return this.calls.filter(call => call.name === name);
  }

  pictures(): HostElement[] {
    return this.elements.filter(element => element.type === PICTURE_TYPE);
  }

  lassoed(): HostElement[] {
    return this.elements.filter(element =>
      this.lasso?.uuids.includes(element.uuid),
    );
  }

  readFile(path: string): string | null {
    return this.files.get(path)?.text ?? null;
  }

  // ---- The SDK's event caches (rules replay, beforeInit) ----

  private send(channel: Channel, msg: unknown): void {
    const label =
      channel === 'button'
        ? `button ${(msg as {id: number}).id}`
        : channel === 'life'
        ? `life ${(msg as {data: {state: number}}).data.state}`
        : 'config';
    if (!this.initialized) {
      this.sent.push(`lost ${label}`);
      return;
    }
    this.sent.push(label);
    this.cache[channel] = {msg, at: this.now};
    this.listeners[channel].forEach(listener =>
      this.deliver(channel, listener, msg),
    );
  }

  private deliver(channel: Channel, listener: AnyListener, msg: unknown): void {
    if (channel === 'button') {
      (listener as ButtonListener).onButtonPress(msg);
    } else if (channel === 'life') {
      (listener as LifeListener).onMsg((msg as {data: unknown}).data);
    } else {
      (listener as ConfigListener).onClick();
    }
  }

  private listen(
    channel: Channel,
    listener: AnyListener,
  ): {remove: () => void} {
    this.listeners[channel].add(listener);
    const cached = this.cache[channel];
    if (cached && this.now - cached.at < REPLAY_MS) {
      this.deliver(channel, listener, cached.msg);
    }
    return {remove: () => this.listeners[channel].delete(listener)};
  }

  private life(state: number): void {
    this.send('life', {data: {state}});
  }

  private show(): void {
    if (this.view === 'hidden') {
      this.view = 'shown';
      // A request parked while hidden is answered on the next press or show (rule permissionOnHide).
      this.parked.splice(0).forEach(request => this.ask(request));
    }
    this.life(LIFE.start);
  }

  /** The view hides after closePluginView answered (rule closeView); allow once ends (rule allowOnce). */
  private close(): void {
    this.view = 'hidden';
    for (const [permission, grant] of this.grants) {
      if (grant === GRANT.once) {
        this.grants.set(permission, GRANT.denied);
      }
    }
    if (!this.lassoSurvivesClose) {
      this.lasso = null;
    }
    this.cancelDialogs();
    this.life(LIFE.stop);
  }

  /** A RuntimeException in a native module: lifecycle 4 then 5, never 3 (rule activityNull). */
  private destroy(): void {
    this.view = 'destroyed';
    this.cancelDialogs();
    this.parked.splice(0).forEach(request => request.resolve(GRANT.cancelled));
    this.life(LIFE.unmounted);
    this.life(LIFE.destroyed);
  }

  // ---- Permissions (rules permissionOnHide, allowOnce) ----

  private settle(request: Request, answer: number): void {
    if (answer === GRANT.denied) {
      this.denied.add(request.permission);
    } else if (answer > GRANT.denied) {
      this.grants.set(request.permission, answer);
    }
    request.resolve(answer);
  }

  private ask(request: Request): void {
    const grant = this.granted(request.permission);
    if (grant !== GRANT.denied) {
      request.resolve(grant);
      return;
    }
    // After a denial the host only points to the system settings (brief section 3.6).
    if (this.denied.has(request.permission)) {
      request.resolve(GRANT.denied);
      return;
    }
    if (this.dialog === 'wait') {
      this.dialogs.push(request);
      return;
    }
    this.settle(request, this.dialog);
  }

  private cancelDialogs(): void {
    this.dialogs.splice(0).forEach(request => request.resolve(GRANT.cancelled));
  }

  // ---- The page and the lasso ----

  private corner(): {right: number; bottom: number} {
    return {right: this.pageSize.width, bottom: this.pageSize.height};
  }

  private toSdk(element: HostElement, prefix = ''): Record<string, unknown> {
    const corners = [
      {x: element.rect.left, y: element.rect.top},
      {x: element.rect.right, y: element.rect.bottom},
    ];
    return {
      uuid: `${prefix}${element.uuid}`,
      type: element.type,
      numInPage: element.numInPage,
      pageNum: element.pageNum,
      layerNum: element.layerNum,
      stroke:
        element.type === STROKE_TYPE
          ? {
              points: {
                size: async () => corners.length,
                getRange: async (start: number, count: number) =>
                  corners.slice(start, start + count),
              },
            }
          : null,
      picture: element.picture ?? null,
    };
  }

  private inPage(rect: Rect): boolean {
    return inside(rect, {left: 0, top: 0, ...this.corner()});
  }

  private addPicture(path: string, rect: Rect, page = this.page): HostElement {
    const element: HostElement = {
      uuid: `picture-${++this.serial}`,
      type: PICTURE_TYPE,
      numInPage: this.elements.length,
      pageNum: page,
      layerNum: 0,
      rect,
      picture: {picturePath: path, rect},
    };
    this.elements.push(element);
    return element;
  }

  /** Centred on the screen, which is the page on the Manta, 100 to 2560 px per side (rule insertImage). */
  private centred(image: Size): Rect {
    let scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
    scale = Math.max(scale, MIN_SIDE / Math.min(image.width, image.height));
    const width = Math.round(image.width * scale);
    const height = Math.round(image.height * scale);
    const left = Math.round((this.pageSize.width - width) / 2);
    const top = Math.round((this.pageSize.height - height) / 2);
    return {left, top, right: left + width, bottom: top + height};
  }

  private noLasso(): ApiResponse<never> {
    return failure(ERROR.noLasso.code, ERROR.noLasso.message);
  }

  // ---- Shared and private storage (rules sharedDelete, sharedInPlace, sharedNeedsPermission) ----

  private needs(permission: string, path: string, verb: string): void {
    if (isShared(path) && this.granted(permission) === GRANT.denied) {
      throw moduleError('IO', `SecurityException: no ${verb} permission`);
    }
  }

  private checkPath(path: string): void {
    const segments = path.slice(1).split('/');
    if (
      !path.startsWith('/') ||
      path.endsWith('/') ||
      segments.some(s => s === '' || s === '.' || s === '..')
    ) {
      throw moduleError(
        'BAD_PATH',
        `an absolute file path is required: ${path}`,
      );
    }
  }

  private store(path: string, entry: Omit<FileEntry, 'order'>): void {
    this.checkPath(path);
    this.needs(PERMISSION.write, path, 'WRITE');
    if (this.files.has(path) && this.moduleWrites === 'replace') {
      this.needs(PERMISSION.delete, path, 'DELETE');
    }
    this.files.set(path, {...entry, order: ++this.writes});
    for (let dir = parentOf(path); dir; dir = parentOf(dir)) {
      this.folders.add(dir);
    }
  }

  private download(url: string, dest: string, size: Size): number {
    if (!url.startsWith('https://')) {
      throw moduleError('HTTPS_ONLY', `only https is allowed: ${url}`);
    }
    this.requests.push(url);
    if (!this.online || this.granted(PERMISSION.internet) === GRANT.denied) {
      throw moduleError('IO', `Unable to resolve host "${hostOf(url)}"`);
    }
    const status = this.failing.get(url) ?? this.failing.get(hostOf(url));
    if (status !== undefined) {
      throw moduleError(`HTTP_${status}`, `HTTP ${status} for ${url}`);
    }
    const cut = this.cutOff.get(hostOf(url));
    if (cut) {
      const half = Math.floor(DOWNLOAD_BYTES / 2);
      this.store(dest, {bytes: half, truncated: true});
      if (cut === 'error') {
        throw moduleError(
          'IO',
          'java.io.IOException: unexpected end of stream',
        );
      }
      return half;
    }
    this.store(dest, {image: size, bytes: DOWNLOAD_BYTES});
    return DOWNLOAD_BYTES;
  }

  /** A PNG the module's PngTail counts as whole: it ends with IEND. */
  private isWholePng(path: string, entry: FileEntry): boolean {
    return (
      path.endsWith('.png') && entry.image !== undefined && !entry.truncated
    );
  }

  private image(path: string): Size {
    const image = this.files.get(path)?.image;
    if (!image) {
      throw moduleError('NOT_FOUND', `no image at ${path}`);
    }
    return image;
  }

  /** `fetch` as the search core calls it (rule internet). */
  readonly fetch = async (url: string): Promise<FakeResponse> => {
    this.calls.push({api: 'network', name: 'fetch', args: [url], at: this.now});
    this.requests.push(url);
    if (!this.online || this.granted(PERMISSION.internet) === GRANT.denied) {
      throw new TypeError('Network request failed');
    }
    const failed = this.failing.get(hostOf(url));
    const name = fixtureFor(url);
    const status = failed ?? (name ? 200 : 404);
    const body =
      status === 200 && name ? readFileSync(join(FIXTURES, name), 'utf8') : '';
    return {
      status,
      ok: status >= 200 && status < 300,
      text: async () => body,
      json: async () => JSON.parse(body),
    };
  };

  // ---- The APIs, by module ----

  /** The image module's preparation: `dest` scaled down to `width`, never up. */
  private prepareImage(src: string, dest: string, width: number) {
    const source = this.image(src);
    const out = Math.min(width, source.width);
    const size = {
      width: out,
      height: Math.round((source.height * out) / source.width),
    };
    this.store(dest, {image: size, bytes: DOWNLOAD_BYTES});
    return {...size, bytes: DOWNLOAD_BYTES, ms: 5};
  }

  private measureImage(path: string) {
    return {...LINE_ART, ...this.image(path)};
  }

  private api(): Record<string, Record<string, Impl>> {
    return {
      PluginManager: {
        // Async, as in sn-plugin-lib 0.2.3 (#95).
        init: async () => {
          this.initialized = true;
          // The SDK reports mounted in init(); the host answers lifecycle 1 (rule mounted).
          this.life(LIFE.mounted);
        },
        registerButton: async (...args: unknown[]) => {
          this.buttons.push(args);
          return true;
        },
        registerConfigButton: async () => true,
        getDeviceType: async () => MANTA,
        getPluginDirPath: async () => PLUGIN_DIR,
        showPluginView: async () => {
          this.show();
          return true;
        },
        closePluginView: async () => {
          setImmediate(() => this.close());
          return true;
        },
        hasPermission: async (permission: string) => this.granted(permission),
        requestPermission: (permission: string) =>
          new Promise<number>(resolve => {
            const request = {permission, resolve};
            if (this.view === 'shown') {
              this.ask(request);
            } else {
              this.parked.push(request);
            }
          }),
        registerButtonListener: (listener: ButtonListener) =>
          this.listen('button', listener),
        registerPluginLifeListener: (listener: LifeListener) =>
          this.listen('life', listener),
        registerConfigButtonListener: (listener: ConfigListener) =>
          this.listen('config', listener),
        registerEventListener: (
          event: string,
          _order: number,
          listener: {onMsg: (msg: unknown) => void},
        ) => {
          if (event === 'event_pen_up') {
            this.penUp.add(listener);
          }
          return {remove: () => this.penUp.delete(listener)};
        },
        registerMotionListener: (
          _order: number,
          listener: {onMsg: (msg: unknown) => void},
        ) => {
          this.motion.add(listener);
          return {remove: () => this.motion.delete(listener)};
        },
      },
      PluginCommAPI: {
        getLassoElements: async () => {
          if (!this.lasso) {
            return this.noLasso();
          }
          // Other uuids than getElements gives (rule lassoUuids).
          return success(this.lassoed().map(e => this.toSdk(e, 'lasso-')));
        },
        getLassoRect: async () =>
          this.lasso ? success(this.lasso.rect) : this.noLasso(),
        lassoElements: async (rect: Rect) => {
          if (!this.inPage(rect)) {
            return failure(ERROR.noLasso.code, 'the rect is outside the page');
          }
          this.lassoAround(rect);
          return success(this.lasso !== null);
        },
        setLassoBoxState: async (state: number) => {
          if (state === 2) {
            this.lasso = null;
          }
          return success(true);
        },
        deleteLassoElements: async () => {
          if (!this.lasso) {
            return this.noLasso();
          }
          const gone = new Set(this.lasso.uuids);
          this.elements = this.elements.filter(e => !gone.has(e.uuid));
          this.lasso = null;
          return success(true);
        },
        recognizeElements: async (
          elements: {numInPage?: number}[],
          size: Size,
        ) => {
          if (
            size?.width !== this.pageSize.width ||
            size?.height !== this.pageSize.height
          ) {
            return failure(ERROR.recognition.code, ERROR.recognition.message);
          }
          const words = elements
            .map(e => this.elements.find(own => own.numInPage === e.numInPage))
            .filter((e): e is HostElement => e?.type === STROKE_TYPE)
            .map(e => e.text ?? '');
          return success(this.recognize(words));
        },
        getCurrentFilePath: async () => success(NOTE_PATH),
        getCurrentPageNum: async () => success(this.page),
        createElement: async (type: number) =>
          success({uuid: `created-${++this.serial}`, type}),
        insertPageElements: async (
          elements: unknown,
          page: number,
          layer?: number | null,
        ) => {
          // Parameter validation throws (rule insertParams).
          if (!Array.isArray(elements)) {
            throw new Error('elements must be an Element array');
          }
          if (!Number.isInteger(page) || page < 0) {
            throw new Error('page must be an integer >= 0');
          }
          if (
            layer !== undefined &&
            layer !== null &&
            (!Number.isInteger(layer) || layer < 0 || layer > 3)
          ) {
            throw new Error('layer must be an integer from 0 to 3');
          }
          for (const element of elements as {
            picture?: {picturePath: string; rect: Rect};
          }[]) {
            if (element.picture) {
              // At the plugin's rect, with no clamping to the page (rule placeAtRect).
              this.addPicture(
                element.picture.picturePath,
                element.picture.rect,
                page,
              );
            }
          }
          return success(true);
        },
        getPenInfo: async () => success({type: 10, color: 0, width: 300}),
      },
      PluginNoteAPI: {
        insertImage: async (path: string) => {
          const image = this.files.get(path)?.image;
          if (!image || !/\.(png|jpe?g)$/i.test(path)) {
            return success(false);
          }
          const picture = this.addPicture(path, this.centred(image));
          // The host shows it as a floating selection: the lasso.
          this.lasso = {uuids: [picture.uuid], rect: picture.rect};
          return success(true);
        },
        insertText: async () => success(true),
        saveCurrentNote: async () => success(true),
      },
      PluginFileAPI: {
        getPageSize: async () =>
          this.granted(PERMISSION.read) === GRANT.denied
            ? failure(
                ERROR.readNotRequested.code,
                ERROR.readNotRequested.message,
              )
            : success(this.pageSize),
        getElements: async (page: number) =>
          success(
            this.elements
              .filter(e => e.pageNum === page)
              .map(e => this.toSdk(e)),
          ),
        getLastElement: async () => {
          const last = this.elements[this.elements.length - 1];
          return success(last ? this.toSdk(last) : null);
        },
        insertElements: async () => success(true),
      },
      FileUtils: {
        // The current activity is null in the host: the call throws past JS (rule activityNull).
        getExternalDirPath: () => {
          this.destroy();
          return new Promise(() => {});
        },
      },
      Ink2PicFiles: {
        downloadToFile: async (url: string, dest: string) =>
          this.download(url, dest, DOWNLOAD_SIZE),
        downloadThumbToFile: async (url: string, dest: string) =>
          this.download(url, dest, THUMB_SIZE),
        deleteFile: async (path: string) => {
          this.checkPath(path);
          if (!this.files.has(path)) {
            return true;
          }
          this.needs(PERMISSION.delete, path, 'DELETE');
          this.files.delete(path);
          return true;
        },
        writeText: async (path: string, text: string) => {
          this.store(path, {text, bytes: text.length});
          return null;
        },
        // In place, as ModuleWork.append does: no temporary file, so no delete (#102).
        appendText: async (path: string, text: string) => {
          this.checkPath(path);
          this.needs(PERMISSION.write, path, 'WRITE');
          const all = (this.files.get(path)?.text ?? '') + text;
          this.files.set(path, {
            text: all,
            bytes: all.length,
            order: ++this.writes,
          });
          for (let dir = parentOf(path); dir; dir = parentOf(dir)) {
            this.folders.add(dir);
          }
          return null;
        },
        // Names and sizes only: no file is opened, so a cut-off PNG is listed too (#102).
        listSizes: async (path: string) => {
          this.checkPath(path);
          if (!this.folders.has(path)) {
            return null;
          }
          return [...this.files.entries()]
            .filter(([file]) => parentOf(file) === path)
            .map(([file, entry]) => ({
              name: file.slice(path.length + 1),
              bytes: entry.bytes,
            }));
        },
        listCompletePngs: async (path: string) => {
          this.checkPath(path);
          if (!this.folders.has(path)) {
            return null;
          }
          return [...this.files.entries()]
            .filter(
              ([file, entry]) =>
                parentOf(file) === path && this.isWholePng(file, entry),
            )
            .map(([file]) => file.slice(path.length + 1));
        },
        isCompletePng: async (path: string) => {
          this.checkPath(path);
          this.needs(PERMISSION.read, path, 'READ');
          const entry = this.files.get(path);
          return entry !== undefined && this.isWholePng(path, entry);
        },
        readText: async (path: string) => {
          this.checkPath(path);
          this.needs(PERMISSION.read, path, 'READ');
          const entry = this.files.get(path);
          return entry ? entry.text ?? '' : null;
        },
        listDir: async (path: string) => {
          this.checkPath(path);
          if (!this.folders.has(path)) {
            return null;
          }
          return [...this.files.entries()]
            .filter(([file]) => parentOf(file) === path)
            .sort(([, a], [, b]) => a.order - b.order)
            .map(([file]) => file.slice(path.length + 1));
        },
      },
      Ink2PicImage: {
        // The five parameters of Ink2PicImageModule.prepareForEink; a contour keeps the size.
        prepareForEink: async (
          src: string,
          dest: string,
          width: number,
          format: string,
          _contour: boolean,
        ) => {
          if (format !== 'png' && format !== 'jpg') {
            throw moduleError(
              'BAD_FORMAT',
              `format must be png or jpg: ${format}`,
            );
          }
          return this.prepareImage(src, dest, width);
        },
        measureThumb: async (path: string) => this.measureImage(path),
        // The thumbnail lane's conversion: the written file and its measures (#101).
        convertThumb: async (src: string, dest: string, width: number) => ({
          ...this.prepareImage(src, dest, width),
          measures: this.measureImage(dest),
        }),
      },
    };
  }

  /**
   * Gives every SDK mock in `sdk` (one module registry's `sn-plugin-lib`) its implementation, a
   * missing one included, sets the plugin's own native modules and `fetch`. Each call is recorded,
   * and a scripted answer (`script`) comes before the simulator's own.
   */
  install(
    sdk: Record<string, Record<string, unknown>>,
    nativeModules: Record<string, unknown>,
  ): this {
    for (const [api, methods] of Object.entries(this.api())) {
      const target: Record<string, unknown> =
        api in sdk
          ? sdk[api]
          : (nativeModules[api] = {} as Record<string, unknown>);
      for (const [name, impl] of Object.entries(methods)) {
        const run = (...args: unknown[]) => {
          this.calls.push({api, name, args, at: this.now});
          const scripted = this.answers.get(name)?.shift();
          return scripted ? scripted(...args) : impl(...args);
        };
        const existing = target[name];
        if (jest.isMockFunction(existing)) {
          existing.mockImplementation(run);
        } else {
          target[name] = jest.fn(run);
        }
      }
    }
    (globalThis as {fetch?: unknown}).fetch = this.fetch;
    return this;
  }
}

export function createHost(options: HostOptions = {}): PluginHost {
  return new PluginHost(options);
}
