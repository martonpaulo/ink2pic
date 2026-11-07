/**
 * «Insert picture» with no view is safe (#93), through the PluginHost simulator: it ends with JS
 * timers stopped (brief section 3.3), it deletes or lassoes only the word it read, and its
 * temporary download is named per result and removed after the insert.
 */
import {INSERT_BUTTON_ID} from '../src/buttons';
import {copy} from '../src/ui/copy';
import {NO_VIEW_LIMIT_MS} from '../src/flow/headlessInsert';
import {defaultSettings, serializeSettings} from '../src/settings/settings';
import {safeFileName, settingsPath} from '../src/storage/paths';
import {Journey, startJourney} from './host/journey';
import {
  PICTURE_TYPE,
  PLUGIN_DIR,
  PluginHost,
  success,
} from './host/pluginHost';

const word = {left: 100, top: 200, right: 300, bottom: 260};
const other = {left: 100, top: 1200, right: 300, bottom: 1260};
// A journey on a machine shared with other gates, as in journeys.test.tsx (#87).
jest.setTimeout(20000);

/** Enough event-loop turns for a whole insert; a run that needs a timer never gets one. */
const MAX_TURNS = 5000;

/** What a test leaves running: the journey, and the timers to restore. */
const open: {journey: Journey | null; thaw: () => void} = {
  journey: null,
  thaw: () => {},
};

afterEach(() => {
  open.thaw();
  open.journey?.end();
  Object.assign(open, {journey: null, thaw: () => {}});
});

/** JS timers stop, as with the view closed (brief section 3.3, REPORTED): none ever fires. */
function freezeTimers(): void {
  const {setTimeout: set, clearTimeout: clear} = globalThis;
  let id = 0;
  globalThis.setTimeout = (() => ++id) as unknown as typeof setTimeout;
  globalThis.clearTimeout = (() => {}) as typeof clearTimeout;
  open.thaw = () => {
    globalThis.setTimeout = set;
    globalThis.clearTimeout = clear;
  };
}

/** Turns the event loop with no timer until `done` holds; false when it never does. */
async function drain(done: () => boolean): Promise<boolean> {
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (done()) {
      return true;
    }
    await new Promise(resolve => setImmediate(resolve));
  }
  return done();
}

function withPlacement(placement: 'below' | 'replace') {
  return (host: PluginHost) => {
    host.grantDeclared();
    const text = serializeSettings({...defaultSettings(null), placement});
    host.files.set(settingsPath(), {text, bytes: text.length, order: 0});
  };
}

function lassoedSoup(setup = withPlacement('below')): Journey {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  const journey = startJourney({}, setup);
  journey.host.write('soup', word);
  journey.host.lassoAround(word);
  open.journey = journey;
  return journey;
}

const logText = (j: Journey) => j.log().join('\n');
const ended = (j: Journey) => () =>
  /insert picture \(no view\): done|insert picture \(no view\) failed/.test(
    logText(j),
  );

describe('Insert picture with no view (#93)', () => {
  it('ends offline with JS timers stopped, shows the failure, and takes the next press', async () => {
    const j = lassoedSoup();
    j.host.online = false;
    freezeTimers();
    j.host.press(INSERT_BUTTON_ID);
    expect(await drain(ended(j))).toBe(true);
    expect(j.host.pictures()).toEqual([]);
    expect(j.host.called('showPluginView')).toHaveLength(1);
    // The log shows the time around each wait, so the device shows whether timers stop.
    expect(logText(j)).toMatch(/wait search: start at \d+/);
    expect(logText(j)).toMatch(/wait search: \d+ ms/);
    j.host.press(INSERT_BUTTON_ID);
    await drain(() => false);
    expect(logText(j)).not.toMatch(/already running, press ignored/);
  });

  it('stops before the search once the limit measured with Date.now() has passed', async () => {
    const j = lassoedSoup();
    j.host.script('recognizeElements', () => {
      j.host.advance(NO_VIEW_LIMIT_MS + 1);
      return success('soup');
    });
    j.host.press(INSERT_BUTTON_ID);
    expect(await drain(ended(j))).toBe(true);
    expect(j.host.pictures()).toEqual([]);
    expect(j.host.called('fetch')).toEqual([]);
    expect(logText(j)).toMatch(/the limit passed before search/);
  });

  it('a press after the limit starts again while an earlier press never ended', async () => {
    const j = lassoedSoup();
    freezeTimers();
    // The recognition never answers, and its time limit is a timer that never fires.
    j.host.script('recognizeElements', () => new Promise(() => {}));
    j.host.press(INSERT_BUTTON_ID);
    await drain(() => false);
    j.host.press(INSERT_BUTTON_ID);
    await drain(() => false);
    expect(logText(j)).toMatch(/already running, press ignored/);
    j.host.advance(NO_VIEW_LIMIT_MS + 1);
    j.host.press(INSERT_BUTTON_ID);
    expect(await drain(ended(j))).toBe(true);
    expect(logText(j)).toMatch(/still running after \d+ ms; starting again/);
    expect(j.host.pictures()).toHaveLength(1);
  });

  it('In place of the word: deletes nothing when the person lassoed other strokes meanwhile', async () => {
    const j = lassoedSoup(withPlacement('replace'));
    j.host.write('cake', other);
    // The person stays on the note and lassoes «cake» while the picture is prepared.
    j.host.script('createElement', (type: unknown) => {
      j.host.lassoAround(other);
      return success({uuid: 'created-person', type});
    });
    j.host.press(INSERT_BUTTON_ID);
    expect(await drain(ended(j))).toBe(true);
    expect(j.host.pictures()).toHaveLength(1);
    expect(j.host.elements.map(e => e.text).filter(Boolean)).toEqual([
      'soup',
      'cake',
    ]);
    expect(j.host.called('deleteLassoElements')).toEqual([]);
    expect(j.host.called('lassoElements')).toEqual([]);
    expect(logText(j)).toMatch(
      /deleteLassoElements: skipped, the lasso changed/,
    );
  });

  it('In place of the word: still deletes the word when the lasso is the one read', async () => {
    const j = lassoedSoup(withPlacement('replace'));
    j.host.press(INSERT_BUTTON_ID);
    expect(await drain(ended(j))).toBe(true);
    const [picture] = j.host.pictures();
    expect(picture.type).toBe(PICTURE_TYPE);
    expect(j.host.elements.some(e => e.text === 'soup')).toBe(false);
    expect(j.host.lassoed()).toEqual([picture]);
  });

  it('does not lasso the picture rect on another page after the person turned the page', async () => {
    const j = lassoedSoup();
    j.host.script('createElement', (type: unknown) => {
      j.host.turnPage(1);
      return success({uuid: 'created-person', type});
    });
    j.host.press(INSERT_BUTTON_ID);
    expect(await drain(ended(j))).toBe(true);
    expect(j.host.pictures()[0].pageNum).toBe(0);
    expect(j.host.called('lassoElements')).toEqual([]);
    expect(logText(j)).toMatch(/lassoElements: skipped, the (lasso|page) changed/);
  });

  it('downloads to a file named for the result and leaves no temporary file behind', async () => {
    const j = lassoedSoup();
    j.host.press(INSERT_BUTTON_ID);
    expect(await drain(ended(j))).toBe(true);
    expect(j.host.pictures()).toHaveLength(1);
    const best = /insert best: (\S+)/.exec(logText(j))?.[1] ?? '';
    const dests = j.host
      .called('downloadToFile')
      .map(call => String(call.args[1]));
    expect(dests.some(dest => dest.includes(safeFileName(best)))).toBe(true);
    expect(dests.some(dest => /insert-download\./.test(dest))).toBe(false);
    await drain(() => false);
    const temporary = [...j.host.files.keys()].filter(path =>
      path.startsWith(`${PLUGIN_DIR}/insert-`),
    );
    expect(temporary).toEqual([]);
  });
});

/** The view the failure opened, mounted, with its status line and query field. */
async function failureView(j: Journey) {
  await j.settle(() => j.host.view === 'shown');
  await j.mountIfShown();
  await j.settle(() => j.searching());
  const status = () =>
    String(j.tree?.root.findByProps({testID: 'status'}).props.children);
  const field = j.tree!.root.findByProps({testID: 'query'}).props.value;
  return {status, field};
}

const downloadFails = () =>
  Promise.reject(Object.assign(new Error('HTTP 503'), {code: 'HTTP_503'}));

describe('a failed Insert picture opens the search screen (#96)', () => {
  it('a failed download: the word searched again, its grid, and the sentence in the status line', async () => {
    const j = lassoedSoup();
    // The early download and the insert's own download both fail.
    j.host.script('downloadToFile', downloadFails, downloadFails);
    j.host.press(INSERT_BUTTON_ID);
    const view = await failureView(j);
    expect(view.field).toBe('soup');
    await j.settle(() => j.tiles().length > 0);
    expect(view.status()).toBe(copy['error.download']);
    expect(j.shows(copy['insert.running'])).toBe(false);
    expect(j.host.pictures()).toEqual([]);
  });

  it('a word not read: an empty field and the lasso sentence, as Find picture shows', async () => {
    const j = lassoedSoup();
    j.host.recognize = () => ' ';
    j.host.press(INSERT_BUTTON_ID);
    const view = await failureView(j);
    expect(view.field).toBe('');
    expect(view.status()).toBe(copy['error.recognition']);
  });
});
