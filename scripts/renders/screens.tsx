/**
 * Every screen the renders show, each driven to its state through the real component with
 * synthetic fixture data (#80). Adding a screen is one line in SCREENS.
 */
import React from 'react';
import {Image, Pressable} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import * as asResults from '../../src/library/asResults';
import * as libraryDevice from '../../src/library/device';
import type {LibraryItem} from '../../src/library/types';
import {log} from '../../src/log/memory';
import * as deviceSearch from '../../src/search/device';
import type {SourceAdapter} from '../../src/search-core';
import type {SearchResult, SourceOutcome} from '../../src/search-core/types';
import {copy} from '../../src/ui/copy';
import {Onboarding} from '../../src/ui/Onboarding';
import {SearchScreen} from '../../src/ui/SearchScreen';
import {StatusScreen} from '../../src/ui/StatusScreen';
import {LanguagesScreen} from '../../src/ui/LanguagesScreen';
import {SettingsScreen, SymbolsControl} from '../../src/ui/SettingsScreen';
import {defaultSettings, Settings} from '../../src/settings/settings';
import type {LanguageCode} from '../../src/settings/languages';
import {PERMISSIONS} from '../../src/onboarding/permissions';

export type ScreenRender = {name: string; render: () => Promise<ReactTestRenderer>};

/** Synthetic line drawings and one grey photo-like picture, as inline SVG thumbnails. */
const DRAWINGS = [
  '<circle cx="200" cy="200" r="150" fill="none" stroke="#000" stroke-width="12"/>',
  '<rect x="60" y="90" width="280" height="220" fill="none" stroke="#000" stroke-width="12"/>',
  '<path d="M200 40 L360 340 L40 340 Z" fill="none" stroke="#000" stroke-width="12"/>',
  '<rect width="400" height="400" fill="#777"/><circle cx="200" cy="160" r="90" fill="#ccc"/>',
  '<path d="M40 300 Q200 20 360 300" fill="none" stroke="#000" stroke-width="12"/>',
  '<circle cx="140" cy="200" r="90" fill="#333"/><circle cx="260" cy="200" r="90" fill="none" stroke="#000" stroke-width="12"/>',
  '<path d="M60 60 L340 340 M340 60 L60 340" stroke="#000" stroke-width="12"/>',
];
const thumb = (drawing: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">${drawing}</svg>`,
  )}`;
export const FIXTURE_RESULTS: SearchResult[] = DRAWINGS.map((drawing, i) => ({
  id: `openclipart:${i + 1}`,
  source: 'openclipart',
  title: `Drawing ${i + 1}`,
  thumbUrl: thumb(drawing),
  license: 'CC0 1.0',
  attribution: 'Openclipart',
}));

const source = (
  name: string,
  answer: () => Promise<SourceOutcome>,
): SourceAdapter => ({name, search: answer});
const answers = (results: SearchResult[]) =>
  source('fixture', async () => ({ok: true, results}));
const fails = (kind: 'network' | 'http') =>
  source(`fixture-${kind}`, async () => ({ok: false, kind, message: 'fixture'}));
/** Answers only when `settle` runs, after the screen was rendered while it searched. */
const waiting: (() => void)[] = [];
const slow = source(
  'fixture-slow',
  () => new Promise(resolve => waiting.push(() => resolve({ok: true, results: []}))),
);
/** Finds a few pictures for a misspelled word and suggests the spelling that finds more (#65). */
const suggests = (typo: string, word: string): SourceAdapter => ({
  name: 'fixture-suggests',
  search: async (query: string): Promise<SourceOutcome> =>
    query === typo
      ? {ok: true, results: FIXTURE_RESULTS.slice(0, 2), suggestion: word}
      : {ok: true, results: FIXTURE_RESULTS},
});
/** Stand-ins one screen sets on a module, undone after that screen. */
const stubs: jest.SpyInstance[] = [];
/** Ends the searches left waiting and undoes the screen's stand-ins, so nothing outlives it. */
export function settle() {
  waiting.splice(0).forEach(answer => answer());
  stubs.splice(0).forEach(stub => stub.mockRestore());
}

/** An expired cached answer, shown because no source answered (#65). */
function staleSearch(word: string) {
  stubs.push(
    jest.spyOn(deviceSearch, 'searchCached').mockResolvedValue({
      results: FIXTURE_RESULTS,
      statuses: {fixture: {state: 'failed', kind: 'http', message: 'fixture'}},
      sourceDown: false,
      allFailed: true,
      stale: true,
    }),
  );
  return search(word, [answers([])]);
}

/** Saved pictures and recent searches; the file module is not on the render machine. */
const SAVED: LibraryItem[] = FIXTURE_RESULTS.slice(0, 4).map((result, i) => ({
  id: result.id,
  source: 'openclipart',
  sourceId: String(i + 1),
  sourceUrl: `https://openclipart.org/detail/${i + 1}`,
  query: result.title,
  license: 'CC0 1.0',
  attribution: 'Openclipart',
  savedAt: '2026-11-06T12:00:00.000Z',
  path: `/storage/emulated/0/MyStyle/Ink2Pic/library/openclipart-${i + 1}.png`,
  width: 400,
  height: 400,
  contour: false,
}));
function libraryTab(items: LibraryItem[], recentSearches: string[]) {
  stubs.push(
    jest.spyOn(libraryDevice, 'getLibrary').mockResolvedValue({items, recentSearches}),
    jest.spyOn(libraryDevice, 'libraryUnreadable').mockReturnValue(null),
    // The saved files are not on the render machine: the same drawings, inline.
    jest
      .spyOn(asResults, 'libraryResults')
      .mockImplementation(shown =>
        shown.map((item, i) => ({...FIXTURE_RESULTS[i], id: `library:${item.id}`})),
      ),
  );
  return mount(<SearchScreen initialQuery="" lassoFailure={null} onPick={async () => ({ok: true, value: null})} onClose={() => {}} />);
}

async function mount(element: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(element);
  });
  return tree;
}

/** Every thumbnail on the page answers, so the grid shows (it waits for all of them). */
async function loadThumbs(tree: ReactTestRenderer) {
  for (const image of tree.root.findAllByType(Image)) {
    await act(async () => image.props.onLoad?.());
  }
  return tree;
}

async function press(tree: ReactTestRenderer, label: string) {
  const button = tree.root
    .findAllByType(Pressable)
    .find(p => p.props.accessibilityLabel === label);
  if (!button) {
    throw new Error(`no button «${label}»`);
  }
  await act(async () => button.props.onPress());
  return tree;
}

/** Each search its own word: the runtime search cache keeps an answer per word. */
const search = (word: string, sources: SourceAdapter[]) =>
  mount(
    <SearchScreen
      initialQuery={word}
      lassoFailure={null}
      onPick={async () => ({ok: true, value: null})}
      onClose={() => {}}
      sources={sources}
    />,
  );

/** 47 of the 1,447 symbols saved; a download stops at 300 (#91). */
const SYMBOLS: SymbolsControl = {status: async () => ({total: 1447, saved: 47}), download: async () => ({total: 1447, saved: 300, complete: false, failed: 3, stopped: true})};
const settingsScreen = (settings: Settings = defaultSettings(null)) =>
  mount(<SettingsScreen settings={settings} onChange={() => {}} onLanguages={() => {}} onClear={async () => true} onClose={() => {}} symbols={SYMBOLS} />);
const languagesScreen = (languages: LanguageCode[]) =>
  mount(<LanguagesScreen languages={languages} onChange={() => {}} onReset={() => {}} onBack={() => {}} onClose={() => {}} />);
/** Every option away from its default, so each row shows another selected value. */
const CHANGED: Settings = {languages: ['zh', 'es', 'en', 'pt'], size: 'large', placement: 'replace', style: 'contour', spacing: 'wide', sourcesOff: ['commons'], dataSaver: true};

// One line per screen, so adding one is one line.
// prettier-ignore
export const SCREENS: ScreenRender[] = [
  {name: 'results', render: async () => loadThumbs(await search('circle', [answers(FIXTURE_RESULTS)]))},
  {name: 'results-partial', render: async () => loadThumbs(await search('square', [answers(FIXTURE_RESULTS), fails('http')]))},
  {name: 'results-source-down-thin', render: async () => loadThumbs(await search('ice', [answers(FIXTURE_RESULTS.slice(0, 3)), fails('http')]))},
  {name: 'results-corrected', render: async () => loadThumbs(await search('circel', [suggests('circel', 'circle')]))},
  {name: 'results-stale', render: async () => loadThumbs(await staleSearch('moon'))},
  {name: 'library-items', render: async () => loadThumbs(await libraryTab(SAVED, ['sun', 'tree', 'house']))},
  {name: 'library-empty', render: () => libraryTab([], [])},
  {name: 'page-loading', render: () => search('triangle', [answers(FIXTURE_RESULTS)])},
  {name: 'loading', render: () => search('cloud', [slow])},
  {name: 'empty', render: () => search('nothing', [answers([])])},
  {name: 'offline', render: () => search('rain', [fails('network')])},
  {name: 'error', render: () => search('storm', [fails('http')])},
  {name: 'recognition-failed', render: () => mount(<SearchScreen initialQuery="" lassoFailure={{ok: false, code: 117, message: 'fixture', step: 'lasso'}} onPick={async () => ({ok: true, value: null})} onClose={() => {}} />)},
  {name: 'log', render: async () => press(await search('star', [answers(FIXTURE_RESULTS)]), copy['action.log'])},
  {name: 'onboarding', render: () => mount(<Onboarding missing={PERMISSIONS} onDone={() => {}} onClose={() => {}} />)},
  {name: 'status-adding', render: () => mount(<StatusScreen text={copy['insert.running']} onClose={() => {}} />)},
  {name: 'status-starting', render: () => mount(<StatusScreen text={copy['app.starting']} onClose={() => {}} />)},
  {name: 'settings', render: () => settingsScreen()},
  {name: 'settings-changed', render: () => settingsScreen(CHANGED)},
  {name: 'settings-clear-question', render: async () => press(await settingsScreen(), copy['settings.clear'])},
  {name: 'settings-cleared', render: async () => press(await press(await settingsScreen(), copy['settings.clear']), copy['settings.clearConfirm'])},
  {name: 'settings-reset-question', render: async () => press(await settingsScreen(), copy['settings.reset'])},
  {name: 'settings-symbols-question', render: async () => press(await settingsScreen(), copy['settings.symbolsDownload'])},
  {name: 'settings-symbols-stopped', render: async () => press(await press(await settingsScreen(), copy['settings.symbolsDownload']), copy['settings.symbolsConfirm'])},
  {name: 'languages', render: () => languagesScreen(['zh', 'es', 'en', 'pt'])},
  {name: 'languages-one', render: () => languagesScreen(['en'])},
  {name: 'languages-reset-question', render: async () => press(await languagesScreen(['es', 'en']), copy['languages.reset'])},
  {name: 'status-failed', render: () => mount(<StatusScreen text={copy['error.unexpected']} onClose={() => {}} />)},
];

/** A few synthetic log lines, so the Log view shows lines as on the device. */
export function fixtureLog() {
  for (let i = 1; i <= 12; i += 1) {
    log(`fixture line ${i}: getLassoElements ok in ${i * 7} ms`);
  }
}
