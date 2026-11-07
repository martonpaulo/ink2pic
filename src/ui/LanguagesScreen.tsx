/**
 * The Languages screen, from the plugin's Settings entry (#68): the query languages in use, in
 * the order they are tried, and the supported ones to add. Every tap saves at once; there is no
 * Save button. On e-ink: no drag, no animation, and the buttons of every row in fixed columns, an
 * empty slot where a row has no ↑ or ↓, so a tap redraws the rows in place.
 */
import React, {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {
  addableLanguages,
  LanguageCode,
  LanguagesAction,
} from '../settings/languages';
import {Button} from './Button';
import {copy, CopyKey} from './copy';
import {LogView} from './LogView';
import {metrics} from './metrics';
import {Screen} from './Screen';
import {shared} from './styles';
import {ToolBar} from './ToolBar';

export type LanguagesScreenProps = {
  languages: readonly LanguageCode[];
  onChange: (action: LanguagesAction) => void;
  /** Restores the product default, after the person confirmed. */
  onReset: () => void;
  /** Back to the Settings screen it was opened from (#70). */
  onBack?: () => void;
  onClose: () => void;
};

export function languageName(code: LanguageCode): string {
  return copy[`language.${code}` as CopyKey];
}

function label(key: CopyKey, code: LanguageCode): string {
  return copy[key].replace('{language}', languageName(code));
}

/** The keys of one row button: its visible label and its spoken one, with the language. */
const ROW_BUTTONS = {
  up: ['languages.up', 'languages.upLabel'],
  down: ['languages.down', 'languages.downLabel'],
  remove: ['languages.remove', 'languages.removeLabel'],
  add: ['languages.add', 'languages.addLabel'],
} as const;

type RowButtonProps = {
  type: keyof typeof ROW_BUTTONS;
  code: LanguageCode;
  onChange: (action: LanguagesAction) => void;
  /** False leaves the cell empty: no ↑ on the first row, no ↓ on the last. */
  shown?: boolean;
  disabled?: boolean;
};

/** One fixed-width cell of a row's button column, so every row's buttons line up. */
function RowButton({
  type,
  code,
  onChange,
  shown = true,
  disabled = false,
}: RowButtonProps): React.JSX.Element {
  const [visible, spoken] = ROW_BUTTONS[type];
  return (
    <View style={styles.cell}>
      {shown && (
        <Button
          label={copy[visible]}
          accessibilityLabel={label(spoken, code)}
          disabled={disabled}
          onPress={() => onChange({type, code})}
        />
      )}
    </View>
  );
}

export function LanguagesScreen({
  languages,
  onChange,
  onReset,
  onBack,
  onClose,
}: LanguagesScreenProps): React.JSX.Element {
  const [showLog, setShowLog] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const last = languages.length - 1;
  return (
    <Screen>
      <ToolBar
        logShown={showLog}
        onLog={() => setShowLog(!showLog)}
        onClose={onClose}>
        {onBack && (
          <Button
            label={copy['settings.back']}
            accessibilityLabel={copy['settings.backLabel']}
            onPress={onBack}
          />
        )}
        <Text
          accessibilityRole="header"
          style={[shared.textLarge, styles.title]}>
          {copy['languages.title']}
        </Text>
      </ToolBar>
      {showLog ? (
        <LogView />
      ) : (
        <>
          <Text style={shared.text}>{copy['languages.hint']}</Text>
          <Text accessibilityRole="header" style={shared.text}>
            {copy['languages.inUse']}
          </Text>
          {languages.map((code, index) => (
            <View key={code} style={[shared.row, styles.row]}>
              <Text style={[shared.text, styles.name]}>
                {`${index + 1}. ${languageName(code)}`}
              </Text>
              <RowButton
                type="up"
                code={code}
                onChange={onChange}
                shown={index > 0}
              />
              <RowButton
                type="down"
                code={code}
                onChange={onChange}
                shown={index < last}
              />
              <RowButton
                type="remove"
                code={code}
                onChange={onChange}
                disabled={languages.length === 1}
              />
            </View>
          ))}
          {addableLanguages(languages).length > 0 && (
            <Text accessibilityRole="header" style={shared.text}>
              {copy['languages.addSection']}
            </Text>
          )}
          {addableLanguages(languages).map(code => (
            <View key={code} style={[shared.row, styles.row]}>
              <Text style={[shared.text, styles.name]}>
                {languageName(code)}
              </Text>
              <RowButton type="add" code={code} onChange={onChange} />
            </View>
          ))}
          {/* Apart from the rows, at the bottom; the question takes the button's place. */}
          <View style={styles.spacer} />
          {confirming ? (
            <View style={[shared.row, styles.reset]}>
              <Text style={[shared.text, styles.name]}>
                {copy['languages.resetQuestion']}
              </Text>
              <Button
                label={copy['languages.reset']}
                onPress={() => {
                  setConfirming(false);
                  onReset();
                }}
              />
              <Button
                label={copy['action.cancel']}
                onPress={() => setConfirming(false)}
              />
            </View>
          ) : (
            <View style={[shared.row, styles.reset]}>
              <Button
                label={copy['languages.reset']}
                onPress={() => setConfirming(true)}
              />
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {flex: 1},
  row: {
    minHeight: metrics.touchTarget,
    paddingVertical: metrics.rowPadding,
    borderBottomWidth: metrics.border,
    borderStyle: 'dotted',
    borderColor: metrics.ink,
  },
  name: {flex: 1},
  cell: {width: metrics.rowButtonWidth},
  spacer: {flex: 1},
  reset: {justifyContent: 'flex-end'},
});
