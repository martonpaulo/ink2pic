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
