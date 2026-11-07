import {PluginManager} from 'sn-plugin-lib';
import {initPlugin, registerButton} from '../src/sdk/buttons';

const register = PluginManager.registerButton as jest.Mock;
const init = PluginManager.init as jest.Mock;

beforeEach(() => jest.resetAllMocks());

describe('registerButton (#24)', () => {
  it('succeeds when the host answers true', async () => {
    register.mockResolvedValue(true);
    expect(await registerButton(1, ['NOTE'], {})).toEqual({
      ok: true,
      value: true,
    });
  });

  it('fails when the host answers false or throws', async () => {
    register.mockResolvedValue(false);
    expect((await registerButton(1, ['NOTE'], {})).ok).toBe(false);
    register.mockRejectedValue(new Error('no host'));
    expect((await registerButton(1, ['NOTE'], {})).ok).toBe(false);
  });
});

describe('initPlugin (#24)', () => {
  it('reports a thrown init', async () => {
    init.mockImplementation(() => {
      throw new Error('no bridge');
    });
    expect(await initPlugin()).toEqual({
      ok: false,
      code: -1,
      message: 'no bridge',
    });
  });

  it('awaits init: a rejection is a failure, never ok (#95)', async () => {
    init.mockRejectedValue(new Error('host not ready'));
    expect(await initPlugin()).toEqual({
      ok: false,
      code: -1,
      message: 'host not ready',
    });
    init.mockResolvedValue(undefined);
    expect(await initPlugin()).toEqual({ok: true, value: true});
  });
});

describe('button queue (#13, gotcha 11)', () => {
  it('keeps a press that came before the view listened, once', () => {
    const {startButtonQueue, takePendingButton, onButtonEvent} =
      jest.requireActual(
        '../src/sdk/buttons',
      ) as typeof import('../src/sdk/buttons');
    let press: ((event: {id: number}) => void) | undefined;
    register.mockReset();
    (PluginManager.registerButtonListener as jest.Mock).mockImplementation(
      listener => {
        press = listener.onButtonPress;
        return {remove: jest.fn()};
      },
    );
    startButtonQueue();
    press?.({id: 200});
    expect(takePendingButton()).toBe(200);
    expect(takePendingButton()).toBeNull();
    const seen: number[] = [];
    const stop = onButtonEvent(({id}) => seen.push(id));
    press?.({id: 100});
    stop();
    press?.({id: 200});
    expect(seen).toEqual([100]);
  });

  it('reports lifecycle states', () => {
    const {onLifecycle} = jest.requireActual(
      '../src/sdk/buttons',
    ) as typeof import('../src/sdk/buttons');
    let msg: ((m: {state: number}) => void) | undefined;
    (PluginManager.registerPluginLifeListener as jest.Mock).mockImplementation(
      listener => {
        msg = listener.onMsg;
        return {remove: jest.fn()};
      },
    );
    const states: number[] = [];
    const stop = onLifecycle(state => states.push(state));
    msg?.({state: 3});
    stop();
    expect(states).toEqual([3]);
  });
});

describe('config button (#68)', () => {
  const actual = () =>
    jest.requireActual(
      '../src/sdk/buttons',
    ) as typeof import('../src/sdk/buttons');

  it('registers, and fails on a false answer', async () => {
    const config = PluginManager.registerConfigButton as jest.Mock;
    config.mockResolvedValue(true);
    expect((await actual().registerConfigButton()).ok).toBe(true);
    config.mockResolvedValue(false);
    expect((await actual().registerConfigButton()).ok).toBe(false);
  });

  it('keeps a click that came before the view listened, once', () => {
    const {startConfigQueue, takePendingConfig, onConfigClick} = actual();
    let click: (() => void) | undefined;
    (
      PluginManager.registerConfigButtonListener as jest.Mock
    ).mockImplementation(listener => {
      click = listener.onClick;
      return {remove: jest.fn()};
    });
    const shown = jest.fn();
    expect(startConfigQueue(shown).ok).toBe(true);
    click?.();
    expect(shown).toHaveBeenCalledTimes(1);
    expect(takePendingConfig()).toBe(true);
    expect(takePendingConfig()).toBe(false);
    const seen = jest.fn();
    const stop = onConfigClick(seen);
    click?.();
    stop();
    click?.();
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('reads the system language from the language event, in any shape', () => {
    const {startLangListener, systemLanguage} = actual();
    let send: ((msg: unknown) => void) | undefined;
    (PluginManager.registerLangListener as jest.Mock).mockImplementation(
      listener => {
        send = listener.onMsg;
        return {remove: jest.fn()};
      },
    );
    expect(startLangListener().ok).toBe(true);
    expect(systemLanguage()).toBeNull();
    send?.('es');
    expect(systemLanguage()).toBe('es');
    send?.({data: {lang: 'zh_CN'}});
    expect(systemLanguage()).toBe('zh_CN');
    // A message with no language keeps the last one.
    send?.({});
    expect(systemLanguage()).toBe('zh_CN');
  });
});
