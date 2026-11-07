/**
 * The device log parser and the replay of the owner's logs through the PluginHost simulator
 * (#79). The parser test uses a synthetic log; the fixtures under fixtures/device-logs/ are real
 * device logs with the note path and the uuids replaced.
 */
import {readFileSync} from 'fs';
import {join} from 'path';
import {SIDEBAR_BUTTON_ID} from '../src/buttons';
import {loggedCalls, parseLine, parseLog, scriptAnswers} from './host/deviceLog';
import {Journey, startJourney} from './host/journey';

const FIXTURES = join(__dirname, 'fixtures', 'device-logs');
const cases: Record<string, {report: string; opening: string; expect: string}> = JSON.parse(
  readFileSync(join(FIXTURES, 'cases.json'), 'utf8'),
);

const synthetic = [
  '+0ms button 200 (live)',
  '[Ink2Pic] +3ms getPageSize …',
  '+9ms getPageSize -> ok {"width":1920,"height":2560} (6 ms)',
  '+10ms getLassoRect …',
  '+12ms getLassoRect -> error 904: No lasso action has been performed. Cannot call the API! (2 ms)',
  '+13ms hasPermission(plugin.permission.INTERNET) -> ok true (1 ms)',
  '+14ms getLassoElements -> ok [{"uuid":"a","type":0},{"uuid":"b"…(2813) (82 ms)',
  '+15ms getPenInfo (before the lasso) -> ok {"type":10} (8 ms)',
  '',
  'not a log line',
].join('\n');

describe('device log parser (#79)', () => {
  it('reads each line kind of a synthetic log', () => {
    expect(parseLog(synthetic)).toEqual([
      {kind: 'note', at: 0, text: 'button 200 (live)'},
      {kind: 'start', at: 3, label: 'getPageSize', method: 'getPageSize'},
      {
        kind: 'ok',
        at: 9,
        label: 'getPageSize',
        method: 'getPageSize',
        value: {width: 1920, height: 2560},
        cut: false,
      },
      {kind: 'start', at: 10, label: 'getLassoRect', method: 'getLassoRect'},
      {
        kind: 'error',
        at: 12,
        label: 'getLassoRect',
        method: 'getLassoRect',
        code: 904,
        message: 'No lasso action has been performed. Cannot call the API!',
      },
      {
        kind: 'ok',
        at: 13,
        label: 'hasPermission(plugin.permission.INTERNET)',
        method: 'hasPermission',
        value: true,
        cut: false,
      },
      {
        kind: 'ok',
        at: 14,
        label: 'getLassoElements',
        method: 'getLassoElements',
        value: null,
        cut: true,
      },
      {
        kind: 'ok',
        at: 15,
        label: 'getPenInfo (before the lasso)',
        method: 'getPenInfo',
        value: {type: 10},
        cut: false,
      },
    ]);
  });

  it('keeps a plain value that is not JSON as text', () => {
    expect(parseLine('+1ms listDir library -> ok none (0 ms)')).toMatchObject({value: 'none'});
  });
});

describe('device log replay (#79)', () => {
  let journey: Journey | null = null;

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    journey?.end();
    journey = null;
  });

  it.each(Object.keys(cases))('%s replays through the simulator', async name => {
    const lines = parseLog(readFileSync(join(FIXTURES, name), 'utf8'));
    expect(lines[0]).toEqual({kind: 'note', at: 0, text: cases[name].opening});
    const j = (journey = startJourney());
    scriptAnswers(j.host, lines);
    const logged = loggedCalls(lines);
    // The log's first calls, up to the first one the person's later action started.
    const opening = logged.slice(0, logged.indexOf('getCurrentFilePath'));
    expect(opening.length).toBeGreaterThan(0);
    await j.press(SIDEBAR_BUTTON_ID);
    await j.settle();
    const made = j.host.calls.map(call => call.name).filter(method => opening.includes(method));
    expect(made.slice(0, opening.length)).toEqual(opening);
    expect(j.log().join('\n')).not.toMatch(/start failed/);
  });
});
