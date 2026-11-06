import pluginConfig from '../PluginConfig.json';
import {version} from '../package.json';
import {USER_AGENT} from '../src/config';

describe('PluginConfig.json', () => {
  it('carries the package version, which the template build does not copy', () => {
    expect(pluginConfig.versionName).toBe(version);
  });

  it('keeps pluginKey equal to the registered app name', () => {
    expect(pluginConfig.pluginKey).toBe('Ink2Pic');
  });

  it('has a 16-character pluginID', () => {
    expect(pluginConfig.pluginID).toMatch(/^[a-z0-9]{16}$/);
  });
});

describe('USER_AGENT', () => {
  it('names the version and the repository', () => {
    expect(USER_AGENT).toBe(
      `Ink2Pic/${version} (+https://github.com/martonpaulo/ink2pic)`,
    );
  });
});
