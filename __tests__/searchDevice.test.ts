import {NativeModules} from 'react-native';
import {FileUtils, PluginManager} from 'sn-plugin-lib';
import {resetSessionForTests} from '../src/storage/session';
import {closeLogFileForTests} from '../src/storage/logFile';
import {searchCached} from '../src/search/device';
import type {SourceAdapter} from '../src/search-core';
import {fullUrl} from '../src/search-core/registry';
import {settingsPath} from '../src/storage/paths';
import {resetSettingsForTests, saveSettings} from '../src/storage/settings';

const files: Record<string, string> = {};
const native = {
  downloadToFile: jest.fn(),
  readText: jest.fn(async (path: string) => files[path] ?? null),
  writeText: jest.fn(async (path: string, text: string) => {
    files[path] = text;
    return null;
  }),
};

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  NativeModules.Ink2PicFiles = native;
  resetSessionForTests();
  resetSettingsForTests();
  closeLogFileForTests();
  (FileUtils.getExternalDirPath as jest.Mock).mockResolvedValue([
    '/storage/emulated/0',
  ]);
  (PluginManager.getPluginDirPath as jest.Mock).mockResolvedValue(
    '/data/plugin',
  );
});

describe('searchCached (#16)', () => {
  it('answers a repeated search from the cache file', async () => {
    const search = jest.fn().mockResolvedValue({
      ok: true,
      results: [
        {
          id: 'openclipart:1',
          source: 'openclipart',
          title: 'Soup',
          thumbUrl: 'https://openclipart.org/image/400px/1',
          license: 'CC0 1.0',
          attribution: 'Openclipart',
        },
      ],
    });
    const sources: SourceAdapter[] = [{name: 'openclipart', search}];
    await searchCached('soup', sources);
    const again = await searchCached('Soup ', sources);
    expect(search).toHaveBeenCalledTimes(1);
    expect(fullUrl(again.results[0], 800)).toBe(
      'https://openclipart.org/image/800px/1',
    );
    expect(Object.keys(files)).toContain('/data/plugin/search-cache.json');
  });
});

describe('the search languages (#68)', () => {
  it('looks the word up in the saved order, and a new order is a new search', async () => {
    files[settingsPath()] = JSON.stringify({languages: ['pt', 'en']});
    const seen: string[][] = [];
    const search = jest.fn(async (_query: string, ctx) => {
      seen.push([...ctx.languages]);
      return {
        ok: true as const,
        results: [
          {
            id: 'commons:Gato.png',
            source: 'commons' as const,
            title: 'Gato',
            thumbUrl: 'https://upload.wikimedia.org/gato.png',
            license: 'CC0',
            attribution: 'Wikimedia Commons',
          },
        ],
      };
    });
    const sources: SourceAdapter[] = [{name: 'commons', search}];
    await searchCached('gato', sources);
    expect(seen).toEqual([['pt', 'en']]);
    await saveSettings({languages: ['en', 'pt']});
    await searchCached('gato', sources);
    expect(seen).toEqual([
      ['pt', 'en'],
      ['en', 'pt'],
    ]);
  });
});
