/**
 * One test per host rule the PluginHost simulator encodes (#78): each fails when the simulator
 * stops following the rule. The checks are keyed by rule id, so a rule with no check does not
 * type-check.
 */
import {NativeModules} from 'react-native';
import * as sdk from 'sn-plugin-lib';
import {
  createHost,
  ERROR,
  GRANT,
  LIFE,
  MANTA_PAGE,
  MAX_SIDE,
  MIN_SIDE,
  NOTE_PATH,
  PERMISSION,
  PICTURE_TYPE,
  PluginHost,
  REPLAY_MS,
  SHARED_ROOT,
} from './host/pluginHost';
import {RuleId, RULES} from './host/rules';

const {PluginManager, PluginCommAPI, PluginNoteAPI, PluginFileAPI, FileUtils} =
  sdk as unknown as Record<string, Record<string, (...args: any[]) => any>>;
type Files = Record<string, (...args: any[]) => Promise<any>>;
const files = () => NativeModules.Ink2PicFiles as Files;
const image = () => NativeModules.Ink2PicImage as Files;

const word = {left: 100, top: 200, right: 300, bottom: 260};
const shared = `${SHARED_ROOT}/MyStyle/Ink2Pic/library/library.json`;
const tick = () => new Promise(resolve => setImmediate(resolve));

function started(options = {}): PluginHost {
  const host = createHost(options).install(
    sdk as unknown as Record<string, Record<string, unknown>>,
    NativeModules,
  );
  PluginManager.init();
  return host;
}

/** A shown view with every declared permission and a picture file ready to insert. */
async function withPicture(): Promise<PluginHost> {
  const host = started();
  host.grantDeclared();
  host.press(1);
  await files().downloadToFile('https://example.org/a.png', `${SHARED_ROOT}/a.png`, {});
  return host;
}

const checks: Record<RuleId, () => Promise<void>> = {
  replay: async () => {
    const host = started();
    host.press(200);
    host.advance(REPLAY_MS - 1);
    const late = jest.fn();
    PluginManager.registerButtonListener({onButtonPress: late});
    expect(late).toHaveBeenCalledTimes(1);
    expect(late).toHaveBeenCalledWith(expect.objectContaining({id: 200}));
    const life = jest.fn();
    PluginManager.registerPluginLifeListener({onMsg: life});
    expect(life).toHaveBeenCalledWith({state: LIFE.start});
    host.tapConfig();
    const config = jest.fn();
    PluginManager.registerConfigButtonListener({onClick: config});
    expect(config).toHaveBeenCalledTimes(1);
    host.advance(REPLAY_MS);
    const later = jest.fn();
    PluginManager.registerButtonListener({onButtonPress: later});
    PluginManager.registerConfigButtonListener({onClick: later});
    expect(later).not.toHaveBeenCalled();
  },
  beforeInit: async () => {
    const host = createHost().install(
      sdk as unknown as Record<string, Record<string, unknown>>,
      NativeModules,
    );
    const listener = jest.fn();
    PluginManager.registerButtonListener({onButtonPress: listener});
    host.press(200);
    PluginManager.init();
    PluginManager.registerButtonListener({onButtonPress: listener});
    expect(listener).not.toHaveBeenCalled();
    expect(host.sent).toEqual(['lost button 200', 'lost life 2', 'life 1']);
  },
  mounted: async () => {
    const host = started();
    expect(host.sent).toEqual([`life ${LIFE.mounted}`]);
  },
  pressPair: async () => {
    const host = started();
    host.press(200);
    host.press(300);
    expect(host.sent.slice(1)).toEqual([
      'button 200',
      `life ${LIFE.start}`,
      'button 300',
      `life ${LIFE.start}`,
    ]);
    expect(host.view).toBe('shown');
  },
  noView: async () => {
    const host = started();
    await PluginManager.registerButton(2, ['NOTE'], {id: 300, showType: 0});
    host.press(300);
    expect(host.sent.slice(1)).toEqual(['button 300']);
    expect(host.view).toBe('hidden');
  },
  silentHide: async () => {
    const host = started();
    host.press(200);
    const life = jest.fn();
    host.advance(REPLAY_MS);
    PluginManager.registerPluginLifeListener({onMsg: life});
    host.hideSilently();
    expect(host.view).toBe('hidden');
    expect(life).not.toHaveBeenCalled();
  },
  lassoEnds: async () => {
    const host = started();
    host.write('soup', word);
    host.lassoAround();
    host.press(200);
    host.hideSilently();
    expect((await PluginCommAPI.getLassoElements()).success).toBe(false);
  },
  permissionOnHide: async () => {
    const host = started({dialog: 'wait'});
    host.press(100);
    const asked = PluginManager.requestPermission(PERMISSION.internet);
    expect(host.waiting()).toEqual({dialogs: 1, parked: 0});
    host.hideSilently();
    expect(await asked).toBe(GRANT.cancelled);
    const parked = PluginManager.requestPermission(PERMISSION.read);
    expect(host.waiting()).toEqual({dialogs: 0, parked: 1});
    host.press(100);
    expect(host.waiting()).toEqual({dialogs: 1, parked: 0});
    host.answerDialog(GRANT.always);
    expect(await parked).toBe(GRANT.always);
  },
  allowOnce: async () => {
    const host = started({dialog: GRANT.once});
    host.press(100);
    expect(await PluginManager.requestPermission(PERMISSION.read)).toBe(
      GRANT.once,
    );
    expect(await PluginManager.hasPermission(PERMISSION.read)).toBe(GRANT.once);
    await PluginManager.closePluginView();
    await tick();
    expect(await PluginManager.hasPermission(PERMISSION.read)).toBe(
      GRANT.denied,
    );
    host.grant(PERMISSION.write, GRANT.always);
    expect(await PluginManager.hasPermission(PERMISSION.write)).toBe(
      GRANT.always,
    );
  },
  closeView: async () => {
    const host = started();
    host.press(100);
    expect(await PluginManager.closePluginView()).toBe(true);
    expect(host.view).toBe('shown');
    await tick();
    expect(host.view).toBe('hidden');
    expect(host.sent[host.sent.length - 1]).toBe(`life ${LIFE.stop}`);
  },
  insertImage: async () => {
    const host = await withPicture();
    host.write('soup', word);
    host.lassoAround();
    expect(await PluginNoteAPI.insertImage(`${SHARED_ROOT}/a.png`)).toEqual({
      success: true,
      result: true,
      error: null,
    });
    const [picture] = host.pictures();
    const {left, top, right, bottom} = picture.rect;
    expect((left + right) / 2).toBe(MANTA_PAGE.width / 2);
    expect((top + bottom) / 2).toBe(MANTA_PAGE.height / 2);
    expect(host.lassoed()).toEqual([picture]);
    // Sides kept between 100 and 2560 px.
    host.files.set(`${SHARED_ROOT}/tiny.png`, {image: {width: 20, height: 40}, bytes: 1, order: 0});
    host.files.set(`${SHARED_ROOT}/huge.png`, {image: {width: 6000, height: 3000}, bytes: 1, order: 0});
    await PluginNoteAPI.insertImage(`${SHARED_ROOT}/tiny.png`);
    await PluginNoteAPI.insertImage(`${SHARED_ROOT}/huge.png`);
    const [, tiny, huge] = host.pictures().map(p => p.rect);
    expect(tiny.right - tiny.left).toBe(MIN_SIDE);
    expect(huge.right - huge.left).toBe(MAX_SIDE);
  },
  insertImageFile: async () => {
    const host = await withPicture();
    host.files.set(`${SHARED_ROOT}/a.gif`, {image: {width: 9, height: 9}, bytes: 1, order: 0});
    for (const path of [`${SHARED_ROOT}/missing.png`, `${SHARED_ROOT}/a.gif`]) {
      expect(await PluginNoteAPI.insertImage(path)).toEqual({
        success: true,
        result: false,
        error: null,
      });
    }
    expect(host.pictures()).toEqual([]);
  },
  placeAtRect: async () => {
    const host = await withPicture();
    const created = await PluginCommAPI.createElement(PICTURE_TYPE);
    const past = {left: 1800, top: 2500, right: 2400, bottom: 2900};
    const element = {
      ...created.result,
      type: PICTURE_TYPE,
      picture: {picturePath: `${SHARED_ROOT}/a.png`, rect: past},
    };
    expect(await PluginCommAPI.insertPageElements([element], 0, 0)).toEqual({
      success: true,
      result: true,
      error: null,
    });
    expect(host.pictures().map(p => p.rect)).toEqual([past]);
  },
  insertParams: async () => {
    started();
    await expect(PluginCommAPI.insertPageElements('x', 0, 0)).rejects.toThrow();
    await expect(PluginCommAPI.insertPageElements([], -1, 0)).rejects.toThrow();
    await expect(PluginCommAPI.insertPageElements([], 0, 4)).rejects.toThrow();
    await expect(PluginCommAPI.insertPageElements([], 0)).resolves.toEqual(
      expect.objectContaining({success: true}),
    );
  },
  lassoInPage: async () => {
    const host = started();
    const stroke = host.write('soup', word);
    host.write('wine', {left: 900, top: 900, right: 1100, bottom: 960});
    expect((await PluginCommAPI.lassoElements(word)).result).toBe(true);
    expect(host.lassoed()).toEqual([stroke]);
    const page = {left: 0, top: 0, right: MANTA_PAGE.width, bottom: MANTA_PAGE.height};
    expect((await PluginCommAPI.lassoElements(page)).success).toBe(true);
  },
  lassoAnswers: async () => {
    started();
    const empty = {left: 0, top: 0, right: 10, bottom: 10};
    expect(await PluginCommAPI.lassoElements(empty)).toEqual(
      expect.objectContaining({success: true, result: false}),
    );
    const past = {left: 0, top: 0, right: MANTA_PAGE.width + 1, bottom: 10};
    expect((await PluginCommAPI.lassoElements(past)).error.code).toBe(
      ERROR.noLasso.code,
    );
  },
  lassoSurvivesClose: async () => {
    for (const survives of [true, false]) {
      const host = started({lassoSurvivesClose: survives});
      host.write('soup', word);
      host.press(200);
      await PluginCommAPI.lassoElements(word);
      await PluginManager.closePluginView();
      await tick();
      expect(host.lasso !== null).toBe(survives);
    }
  },
  noLasso: async () => {
    started();
    for (const call of [PluginCommAPI.getLassoElements, PluginCommAPI.getLassoRect]) {
      expect(await call()).toEqual({
        success: false,
        result: null,
        error: ERROR.noLasso,
      });
    }
  },
  lassoUuids: async () => {
    const host = started();
    host.write('soup', word);
    host.lassoAround();
    const lassoed = (await PluginCommAPI.getLassoElements()).result;
    const page = (await PluginFileAPI.getElements(0, NOTE_PATH)).result;
    expect(lassoed[0].uuid).not.toBe(page[0].uuid);
    expect(lassoed[0].numInPage).toBe(page[0].numInPage);
  },
  recognizeSize: async () => {
    const host = started();
    host.write('soup', word);
    host.lassoAround();
    const elements = (await PluginCommAPI.getLassoElements()).result;
    const lassoSize = {width: 200, height: 60};
    expect(await PluginCommAPI.recognizeElements(elements, lassoSize)).toEqual({
      success: false,
      result: null,
      error: ERROR.recognition,
    });
    expect(
      (await PluginCommAPI.recognizeElements(elements, MANTA_PAGE)).result,
    ).toBe('soup');
  },
  pageSizeRead: async () => {
    const host = started();
    expect((await PluginFileAPI.getPageSize(NOTE_PATH, 0)).error).toEqual(
      ERROR.readNotRequested,
    );
    host.grant(PERMISSION.read, GRANT.always);
    expect((await PluginFileAPI.getPageSize(NOTE_PATH, 0)).result).toEqual(
      MANTA_PAGE,
    );
  },
  sharedDelete: async () => {
    const host = started({moduleWrites: 'replace'});
    host.grantDeclared();
    await files().writeText(shared, '{}');
    await expect(files().writeText(shared, '{"a":1}')).rejects.toMatchObject({
      code: 'IO',
      message: 'SecurityException: no DELETE permission',
    });
    await expect(files().deleteFile(shared)).rejects.toThrow(
      'no DELETE permission',
    );
    // The private folder needs no permission.
    const own = '/data/user/0/x/plugins/p/insert-download.png';
    await files().writeText(own, 'a');
    await expect(files().writeText(own, 'b')).resolves.toBeNull();
    host.grant(PERMISSION.delete, GRANT.always);
    await expect(files().deleteFile(shared)).resolves.toBe(true);
  },
  sharedInPlace: async () => {
    const host = started();
    host.grantDeclared();
    for (const text of ['1', '2', '3', '4']) {
      await files().writeText(shared, text);
    }
    expect(host.readFile(shared)).toBe('4');
  },
  sharedNeedsPermission: async () => {
    const host = started();
    await expect(files().writeText(shared, '{}')).rejects.toThrow(
      'no WRITE permission',
    );
    await expect(files().readText(shared)).rejects.toThrow('no READ permission');
    host.grantDeclared();
    await files().writeText(shared, '{}');
    await expect(files().readText(shared)).resolves.toBe('{}');
    await expect(
      image().prepareForEink(`${SHARED_ROOT}/none.png`, shared, 640, 'png', false),
    ).rejects.toMatchObject({code: 'NOT_FOUND'});
  },
  activityNull: async () => {
    const host = started();
    host.press(100);
    const answered = jest.fn();
    FileUtils.getExternalDirPath().then(answered);
    await tick();
    expect(answered).not.toHaveBeenCalled();
    expect(host.view).toBe('destroyed');
    expect(host.sent.slice(-2)).toEqual([
      `life ${LIFE.unmounted}`,
      `life ${LIFE.destroyed}`,
    ]);
    expect(host.sent).not.toContain(`life ${LIFE.stop}`);
  },
  internet: async () => {
    const host = started();
    await expect(host.fetch('https://openclipart.org/search/?query=soup')).rejects.toThrow(
      'Network request failed',
    );
    host.grant(PERMISSION.internet, GRANT.always);
    expect((await host.fetch('https://openclipart.org/search/?query=soup')).status).toBe(200);
    host.online = false;
    await expect(host.fetch('https://openclipart.org/')).rejects.toThrow(
      'Network request failed',
    );
    await expect(
      files().downloadToFile('https://openclipart.org/a.png', `${SHARED_ROOT}/a.png`, {}),
    ).rejects.toMatchObject({code: 'IO'});
  },
  apiResponse: async () => {
    const host = started();
    host.grantDeclared();
    const answers = [
      await PluginCommAPI.getCurrentFilePath(),
      await PluginCommAPI.getCurrentPageNum(),
      await PluginCommAPI.getLassoRect(),
      await PluginFileAPI.getPageSize(NOTE_PATH, 0),
      await PluginNoteAPI.insertImage('/none.png'),
    ];
    for (const answer of answers) {
      expect(Object.keys(answer).sort()).toEqual(['error', 'result', 'success']);
      expect(answer.success ? answer.error : answer.result).toBeNull();
    }
  },
};

describe('PluginHost simulator rules (#78)', () => {
  it.each(Object.keys(RULES) as RuleId[])('%s', async id => {
    await checks[id]();
  });

  it('names a source and a tag for every rule', () => {
    for (const rule of Object.values(RULES)) {
      expect(rule.source.length).toBeGreaterThan(0);
      expect(['CONFIRMED', 'REPORTED', 'INFERENCE', 'TO TEST']).toContain(
        rule.tag,
      );
    }
  });

  it('keeps the brief tags: the lasso after a close is TO TEST, the undocumented answers INFERENCE', () => {
    expect(RULES.lassoSurvivesClose.tag).toBe('TO TEST');
    expect(RULES.noLasso.tag).toBe('INFERENCE');
    expect(RULES.lassoAnswers.tag).toBe('INFERENCE');
  });
});
