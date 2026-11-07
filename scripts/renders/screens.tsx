/**
 * Every screen the renders show, each driven to its state through the real component with
 * synthetic fixture data (#80). Adding a screen is one line in SCREENS.
 */
import React from 'react';
import {Image, Pressable} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {log} from '../../src/log/memory';
import type {SourceAdapter} from '../../src/search-core';
import type {SearchResult, SourceOutcome} from '../../src/search-core/types';
import {copy} from '../../src/ui/copy';
import {Onboarding} from '../../src/ui/Onboarding';
import {SearchScreen} from '../../src/ui/SearchScreen';
import {StatusScreen} from '../../src/ui/StatusScreen';
import {LanguagesScreen} from '../../src/ui/LanguagesScreen';
import {SettingsScreen} from '../../src/ui/SettingsScreen';
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
/** Ends the searches left waiting, so no timer outlives the renders. */
export function settle() {
  waiting.splice(0).forEach(answer => answer());
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

const settingsScreen = (settings: Settings = defaultSettings(null)) =>
  mount(<SettingsScreen settings={settings} onChange={() => {}} onLanguages={() => {}} onClear={async () => true} onClose={() => {}} />);
const languagesScreen = (languages: LanguageCode[]) =>
  mount(<LanguagesScreen languages={languages} onChange={() => {}} onReset={() => {}} onBack={() => {}} onClose={() => {}} />);
/** Every option away from its default, so each row shows another selected value. */
const CHANGED: Settings = {languages: ['zh', 'es', 'en', 'pt'], size: 'large', placement: 'replace', style: 'contour', spacing: 'wide', sourcesOff: ['commons'], dataSaver: true};

// One line per screen, so adding one is one line.
// prettier-ignore
export const SCREENS: ScreenRender[] = [
  {name: 'results', render: async () => loadThumbs(await search('circle', [answers(FIXTURE_RESULTS)]))},
  {name: 'results-partial', render: async () => loadThumbs(await search('square', [answers(FIXTURE_RESULTS), fails('http')]))},
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
