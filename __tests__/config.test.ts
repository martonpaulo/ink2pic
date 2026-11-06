import pluginConfig from '../PluginConfig.json';
import {version} from '../package.json';
import {USER_AGENT} from '../src/config';
import {PERMISSIONS} from '../src/onboarding/permissions';

describe('PluginConfig.json', () => {
  it('carries the package version, which the template build does not copy', () => {
    expect(pluginConfig.versionName).toBe(version);
  });

  it('keeps pluginKey equal to the registered app name', () => {
    expect(pluginConfig.pluginKey).toBe('Ink2Pic');
  });

  it('names its author, shown as «By:» in the plugin list (docs.supernote.com, first-plugin)', () => {
    expect(pluginConfig.author).toBe('Marton Paulo');
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

describe('review readiness (#28)', () => {
  it('discloses in desc where the searched word goes', () => {
    expect(pluginConfig.desc).toMatch(/Openclipart/);
    expect(pluginConfig.desc).toMatch(/Wikimedia Commons/);
    // #43 asks Wikidata for the word's typical pictures (#28: every destination is named).
    expect(pluginConfig.desc).toMatch(/Wikidata/);
  });

  it('declares only the permissions the code requests', () => {
    // Derived from the list the onboarding requests, so a permission added in code but not in
    // the config fails here (build 0.1.0 (2) class, error 1503; Ratta's review, #28).
    expect([...pluginConfig['uses-permissions']].sort()).toEqual(
      PERMISSIONS.map(need => need.permission).sort(),
    );
  });
});
