/**
 * The Settings screen, from the plugin's Settings entry (#70): one row per option with its values
 * as buttons, the current one marked with the selected bar, as the system marks the open
 * Settings section (brief 8.4). Every tap is saved at once and used by the next search or insert.
 * Clear and Reset ask first, in the fixed status line at the bottom, so nothing above moves.
 */
import React, {useState} from 'react';
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
};

/** What the bottom line shows: nothing, a question, or how Clear ended. */
type Bottom = 'none' | 'clear' | 'reset' | 'cleared' | 'clearFailed';

const BOTTOM_TEXT: Record<Bottom, string> = {
  none: '',
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
}: SettingsScreenProps): React.JSX.Element {
  const [showLog, setShowLog] = useState(false);
  const [bottom, setBottom] = useState<Bottom>('none');
  const asking = bottom === 'clear' || bottom === 'reset';
  const confirm = async () => {
    if (bottom === 'reset') {
      setBottom('none');
      onChange({type: 'reset', system: null});
      return;
    }
    setBottom((await onClear()) ? 'cleared' : 'clearFailed');
  };
  return (
    <Screen>
      <ToolBar
        logShown={showLog}
        onLog={() => setShowLog(!showLog)}
        onClose={onClose}>
        <Text
          accessibilityRole="header"
          style={[shared.textLarge, styles.title]}>
          {copy['settings.title']}
        </Text>
      </ToolBar>
      {showLog ? (
        <LogView />
      ) : (
        <>
          <View style={[shared.row, styles.languages]}>
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
          <View style={styles.grow} />
          {/* Reserved: a question or a result never moves the options above. */}
          <Text style={[shared.text, styles.bottomText]}>
            {BOTTOM_TEXT[bottom]}
          </Text>
          <View style={[shared.row, styles.actions]}>
            {asking ? (
              <>
                <Button
                  label={
                    copy[
                      bottom === 'clear'
                        ? 'settings.clearConfirm'
                        : 'settings.reset'
                    ]
                  }
                  onPress={confirm}
                />
                <Button
                  label={copy['action.cancel']}
                  onPress={() => setBottom('none')}
                />
              </>
            ) : (
              <>
                <Button
                  label={copy['settings.clear']}
                  onPress={() => setBottom('clear')}
                />
                <Button
                  label={copy['settings.reset']}
                  onPress={() => setBottom('reset')}
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
  title: {flex: 1},
  grow: {flex: 1},
  option: {gap: metrics.controlGap},
  languages: {
    minHeight: metrics.touchTarget,
    paddingBottom: metrics.rowPadding,
    borderBottomWidth: metrics.border,
    borderStyle: 'dotted',
    borderColor: metrics.ink,
  },
  bottomText: {minHeight: metrics.bodyLineHeight * 2},
  actions: {justifyContent: 'flex-end'},
});
