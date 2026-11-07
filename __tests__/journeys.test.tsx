/**
 * Whole journeys through the plugin against the PluginHost simulator (#78): index.js and App as
 * the host runs them, the search sources answered from the fixtures, files in the simulator's
 * storage. Each journey is one the device rounds tested by hand.
 */
import {INSERT_BUTTON_ID, LASSO_BUTTON_ID, SIDEBAR_BUTTON_ID} from '../src/buttons';
import {copy} from '../src/ui/copy';
import {Journey, startJourney} from './host/journey';
import {GRANT, LIFE, PERMISSION, PICTURE_TYPE, REPLAY_MS} from './host/pluginHost';

const word = {left: 100, top: 200, right: 300, bottom: 260};

let journey: Journey | null = null;

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  journey?.end();
  journey = null;
});

/** A journey with «soup» written and lassoed. */
function lassoedSoup(...args: Parameters<typeof startJourney>): Journey {
  journey = startJourney(...args);
  journey.host.write('soup', word);
  journey.host.lassoAround();
  return journey;
}

const query = (j: Journey) =>
  j.tree?.root.findByProps({testID: 'query'}).props.value as string;

describe('journeys (#78)', () => {
  it('lasso a word, Find picture, pick: the picture lands below the word, lassoed, and the view closes', async () => {
    const j = lassoedSoup();
    await j.press(LASSO_BUTTON_ID);
    await j.settle(() => j.tiles().length > 0);
    expect(query(j)).toBe('soup');
    expect(j.host.called('recognizeElements')).toHaveLength(1);
    await j.pick(0);
    await j.settle(() => j.host.view === 'hidden');
    const [picture] = j.host.pictures();
    expect(picture.rect.top).toBeGreaterThan(word.bottom);
    expect(picture.rect.left).toBe(word.left);
    expect(j.host.lassoed()).toEqual([picture]);
    expect(j.host.called('insertImage')).toHaveLength(0);
    expect(j.host.sent[j.host.sent.length - 1]).toBe(`life ${LIFE.stop}`);
  });

  it('Insert picture in one tap: the best picture goes below the word with no grid', async () => {
    const j = lassoedSoup();
    await j.press(INSERT_BUTTON_ID);
    await j.settle(() => j.host.view === 'hidden');
    expect(j.tiles()).toEqual([]);
    const [picture] = j.host.pictures();
    expect(picture.type).toBe(PICTURE_TYPE);
    expect(picture.rect.top).toBeGreaterThan(word.bottom);
    expect(j.host.lassoed()).toEqual([picture]);
    expect(j.log().join('\n')).toMatch(/insert best: /);
  });

  // Not run (#78): offline, OpenMoji answers from its bundled index while every network source
  // fails, so searchState (src/search-core/state.ts) gives `partial`, not `offline`: the grid
  // shows OpenMoji tiles whose pictures need the network, with the source-down sentence instead
  // of the offline one. A product bug in the search state, which #82 is changing; make this
  // journey a test once it is fixed: Find picture shows copy['error.offline'], no tile, and
  // Insert picture inserts nothing.
  it.todo('offline: Find picture shows the no-internet sentence, Insert picture inserts nothing');

  // Which page shows the source-down sentence is #82's rule, so this journey does not check it.
  it('one source failing: the other sources fill the grid, and a pick still inserts', async () => {
    const j = lassoedSoup();
    // Commons down also fails Wikidata, whose pictures come from the Commons API.
    j.host.failing.set('commons.wikimedia.org', 503);
    await j.press(LASSO_BUTTON_ID);
    await j.settle(() => j.tiles().length > 0 && !j.shows(copy['search.running']));
    expect(j.tiles().length).toBeGreaterThan(0);
    expect(j.tiles().filter(id => /^tile-(commons|wikidata)/.test(id))).toEqual([]);
    await j.pick(0);
    await j.settle(() => j.host.view === 'hidden');
    expect(j.host.pictures()).toHaveLength(1);
  });

  it('a press replayed within 1000 ms to a late listener opens the view once', async () => {
    const j = lassoedSoup();
    await j.press(LASSO_BUTTON_ID, {mount: false});
    // The view mounts 600 ms after the press: the host replays lifecycle 2 to its new listener.
    j.host.advance(REPLAY_MS - 400);
    await j.mountIfShown();
    expect(j.log()).toContain(`+${REPLAY_MS - 400}ms lifecycle ${LIFE.start}`);
    // The same press again 300 ms later, as a replay: handled once.
    j.host.advance(300);
    await j.press(LASSO_BUTTON_ID);
    await j.settle(() => j.tiles().length > 0);
    expect(j.log().join('\n')).toMatch(/button 200 \(live\) already handled/);
    expect(j.host.called('recognizeElements')).toHaveLength(1);
    expect(query(j)).toBe('soup');
  });

  it('a view that mounts after the 1000 ms replay still opens from the queued press', async () => {
    const j = lassoedSoup();
    await j.press(LASSO_BUTTON_ID, {mount: false});
    j.host.advance(REPLAY_MS + 500);
    await j.mountIfShown();
    await j.settle(() => j.tiles().length > 0);
    expect(j.log().join('\n')).not.toMatch(/lifecycle 2/);
    expect(j.host.called('recognizeElements')).toHaveLength(1);
    expect(query(j)).toBe('soup');
  });

  it('silent hide, then a new lasso and press: a new opening searches the new word', async () => {
    const j = lassoedSoup();
    await j.press(LASSO_BUTTON_ID);
    await j.settle(() => j.tiles().length > 0);
    const before = j.host.sent.length;
    j.host.hideSilently();
    expect(j.host.sent).toHaveLength(before);
    j.host.advance(5000);
    j.host.write('wine', {left: 100, top: 900, right: 300, bottom: 960});
    j.host.lassoAround({left: 0, top: 800, right: 1920, bottom: 1000});
    await j.press(LASSO_BUTTON_ID);
    await j.settle(() => query(j) === 'wine' && j.tiles().length > 0);
    expect(j.host.called('recognizeElements')).toHaveLength(2);
    expect(j.host.view).toBe('shown');
  });

  it('first use from the side bar: the missing permissions show, Start asks each once, then the search opens', async () => {
    journey = startJourney({}, () => {});
    const j = journey;
    await j.press(SIDEBAR_BUTTON_ID);
    await j.settle(() => j.shows(copy['onboarding.start']));
    expect(j.shows(copy['error.permission.internet'])).toBe(true);
    await j.tap(copy['onboarding.start']);
    await j.settle(() => j.searching());
    expect(j.host.called('requestPermission').map(call => call.args[0])).toEqual([
      PERMISSION.internet,
      PERMISSION.read,
      PERMISSION.write,
    ]);
    expect(j.host.granted(PERMISSION.internet)).toBe(GRANT.always);
    expect(query(j)).toBe('');
  });
});
