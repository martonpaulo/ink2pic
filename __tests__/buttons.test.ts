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
  it('reports a thrown init', () => {
    init.mockImplementation(() => {
      throw new Error('no bridge');
    });
    expect(initPlugin()).toEqual({ok: false, code: -1, message: 'no bridge'});
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
