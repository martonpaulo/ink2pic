/**
 * The Settings screen, from the plugin's Settings entry (#70): one row per option with its values
 * as buttons, the current one marked with the selected bar, as the system marks the open
 * Settings section (brief 8.4). Every tap is saved at once and used by the next search or insert.
 * Clear and Reset ask first, in the fixed status line at the bottom, so nothing above moves.
 * «Download symbols» (#91) states the size there first, then its progress.
 */
import React, {useEffect, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {
  canTurnOff,
  ChoiceKey,
  CHOICES,
  Settings,
  SettingsAction,
  SOURCE_NAMES,
  sourceOn,
} from '../settings/settings';
import {
  downloadAllSymbols,
  missingMegabytes,
  symbolsStatus,
  SymbolsStatus,
} from '../symbols/store';
import {Button} from './Button';
import {copy, CopyKey} from './copy';
import {languageName} from './LanguagesScreen';
import {LogView} from './LogView';
import {metrics} from './metrics';
import {Screen} from './Screen';
import {shared} from './styles';
import {ToolBar} from './ToolBar';

export type SettingsScreenProps = {
  settings: Settings;
  onChange: (action: SettingsAction) => void;
  onLanguages: () => void;
  /** Clears the library list and recent searches; false when the file could not be written. */
  onClear: () => Promise<boolean>;
  onClose: () => void;
  /** The offline symbols (#91); the device's own store when absent. */
  symbols?: SymbolsControl;
};

/** What Settings reads and starts of the offline symbols. */
export type SymbolsControl = {
  status: () => Promise<SymbolsStatus>;
  download: typeof downloadAllSymbols;
};

const DEVICE_SYMBOLS: SymbolsControl = {
  status: symbolsStatus,
  download: downloadAllSymbols,
};

/** What the bottom line shows: nothing, a question, or how Clear ended. */
type Bottom =
  | 'none'
  | 'clear'
  | 'reset'
  | 'cleared'
  | 'clearFailed'
  | 'symbols'
  | 'downloading';

/** `symbols` and `downloading` show a line with numbers in it, from `symbolsLine`. */
const BOTTOM_TEXT: Record<Bottom, string> = {
  none: '',
  symbols: '',
  downloading: '',
  clear: copy['settings.clearQuestion'],
  reset: copy['settings.resetQuestion'],
  cleared: copy['settings.cleared'],
  clearFailed: copy['settings.clearFailed'],
};

/** An option's label, then its values as buttons in one row. */
function Option({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.option}>
      <Text style={shared.text}>{label}</Text>
      <View style={shared.row}>{children}</View>
    </View>
  );
}

/** 1447 as «1,447». */
function grouped(count: number): string {
  return String(count).replace(/\B(?=(\d{3})+$)/g, ',');
}

/** A copy text with its `{name}` slots filled. */
function fill(key: CopyKey, values: Record<string, number>): string {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, grouped(value)),
    copy[key] as string,
  );
}

function ChoiceRow<K extends ChoiceKey>({
  name,
  settings,
  onChange,
}: {
  name: K;
  settings: Settings;
  onChange: (action: SettingsAction) => void;
}): React.JSX.Element {
  return (
    <Option label={copy[`settings.${name}` as CopyKey]}>
      {CHOICES[name].map(value => (
        <Button
          key={value}
          label={copy[`settings.${name}.${value}` as CopyKey]}
          selected={settings[name] === value}
          onPress={() => onChange({type: 'choose', key: name, value})}
        />
      ))}
    </Option>
  );
}

export function SettingsScreen({
  settings,
  onChange,
  onLanguages,
  onClear,
  onClose,
  symbols = DEVICE_SYMBOLS,
}: SettingsScreenProps): React.JSX.Element {
  const [showLog, setShowLog] = useState(false);
  const [bottom, setBottom] = useState<Bottom>('none');
  const [symbolsNow, setSymbolsNow] = useState<SymbolsStatus | null>(null);
  /** A line with numbers in it, shown instead of the bottom's fixed text. */
  const [symbolsLine, setSymbolsLine] = useState<string | null>(null);
  const asking =
    bottom === 'clear' || bottom === 'reset' || bottom === 'symbols';
  useEffect(() => {
    let shown = true;
    symbols.status().then(status => shown && setSymbolsNow(status));
    return () => {
      shown = false;
    };
  }, [symbols]);
  const ask = (next: Bottom) => {
    setSymbolsLine(null);
    setBottom(next);
  };
  const askSymbols = () => {
    if (!symbolsNow) {
      return;
    }
    if (symbolsNow.saved >= symbolsNow.total) {
      ask('none');
      setSymbolsLine(copy['settings.symbolsDone']);
      return;
    }
    setBottom('symbols');
    setSymbolsLine(
      fill('settings.symbolsQuestion', {
        count: symbolsNow.total - symbolsNow.saved,
        size: missingMegabytes(symbolsNow),
      }),
    );
  };
  const downloadSymbols = async () => {
    setBottom('downloading');
    const progress = (status: SymbolsStatus) => {
      setSymbolsNow(status);
      setSymbolsLine(fill('settings.symbolsProgress', status));
    };
    if (symbolsNow) {
      progress(symbolsNow);
    }
    const end = await symbols.download(progress);
    setSymbolsNow(end);
    setBottom('none');
    setSymbolsLine(
      end.complete
        ? copy['settings.symbolsDone']
        : fill('settings.symbolsStopped', {saved: end.saved, total: end.total}),
    );
  };
  const confirm = async () => {
    if (bottom === 'symbols') {
      await downloadSymbols();
      return;
    }
    if (bottom === 'reset') {
      setBottom('none');
      onChange({type: 'reset', system: null});
      return;
    }
    setBottom((await onClear()) ? 'cleared' : 'clearFailed');
  };
  const confirmButton = (
    <Button
      label={
        copy[
          bottom === 'clear'
            ? 'settings.clearConfirm'
            : bottom === 'symbols'
            ? 'settings.symbolsConfirm'
            : 'settings.reset'
        ]
      }
      onPress={confirm}
    />
  );
  return (
    <Screen>
      <ToolBar
        logShown={showLog}
        onLog={() => setShowLog(!showLog)}
        onClose={onClose}
        title={copy['settings.title']}
      />
      {showLog ? (
        <LogView />
      ) : (
        <>
          <View style={[shared.row, shared.listRow]}>
            <View style={styles.grow}>
              <Text style={shared.text}>{copy['settings.languages']}</Text>
              <Text style={shared.text}>
                {settings.languages.map(languageName).join(', ')}
              </Text>
            </View>
            <Button
              label={copy['settings.languagesOpen']}
              accessibilityLabel={copy['settings.languagesOpenLabel']}
              onPress={onLanguages}
            />
          </View>
          <ChoiceRow name="size" settings={settings} onChange={onChange} />
          <ChoiceRow name="placement" settings={settings} onChange={onChange} />
          <Text style={shared.text}>{copy['settings.placementNote']}</Text>
          <ChoiceRow name="style" settings={settings} onChange={onChange} />
          <ChoiceRow name="spacing" settings={settings} onChange={onChange} />
          <Option label={copy['settings.sources']}>
            {SOURCE_NAMES.map(name => {
              const on = sourceOn(settings, name);
              return (
                <Button
                  key={name}
                  label={copy[`source.${name}` as CopyKey] ?? name}
                  selected={on}
                  disabled={on && !canTurnOff(settings, name)}
                  onPress={() => onChange({type: 'source', name, on: !on})}
                />
              );
            })}
          </Option>
          <Option label={copy['settings.dataSaver']}>
            {[false, true].map(on => (
              <Button
                key={String(on)}
                label={
                  copy[on ? 'settings.dataSaver.on' : 'settings.dataSaver.off']
                }
                selected={settings.dataSaver === on}
                onPress={() => onChange({type: 'dataSaver', on})}
              />
            ))}
          </Option>
          {/* One row, label and action side by side: a second line would push the actions off. */}
          <View style={[shared.row, shared.listRow]}>
            <Text style={[shared.text, styles.grow]}>
              {symbolsNow
                ? fill('settings.symbols', symbolsNow)
                : copy['source.openmoji']}
            </Text>
            <Button
              label={copy['settings.symbolsDownload']}
              disabled={!symbolsNow || bottom === 'downloading'}
              onPress={askSymbols}
            />
          </View>
          {/* The line beside the actions, at the bottom: a question or a result never moves the
              options above, and the screen keeps its padding free (#97). */}
          <View style={[shared.actions, styles.bottom]}>
            <Text style={[shared.text, shared.statusLine, styles.grow]}>
              {symbolsLine ?? BOTTOM_TEXT[bottom]}
            </Text>
            {asking ? (
              <>
                {/* Clear holds the leading slot, so its confirm takes the trailing one: a double
                    tap lands on Cancel, never on the confirm (#97). */}
                {bottom !== 'clear' && confirmButton}
                <Button
                  label={copy['action.cancel']}
                  onPress={() => ask('none')}
                />
                {bottom === 'clear' && confirmButton}
              </>
            ) : (
              <>
                <Button
                  label={copy['settings.clear']}
                  disabled={bottom === 'downloading'}
                  onPress={() => ask('clear')}
                />
                <Button
                  label={copy['settings.reset']}
                  disabled={bottom === 'downloading'}
                  onPress={() => ask('reset')}
                />
              </>
            )}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: {flex: 1},
  /** At the bottom of the screen, without a spacer and its section gap. */
  bottom: {marginTop: 'auto'},
  /** The option's label above its row of values. */
  option: {gap: metrics.rowPadding},
});
