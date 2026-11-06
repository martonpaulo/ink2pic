/**
 * The one bordered button of every screen: black on white, at least a touch target high.
 * As in the Supernote system interface (firmware 3.31.45), black fill marks the one primary
 * action of a screen, such as OK or Start; a selected toggle shows a bar under its label, as the
 * system marks the open page or Settings section (#50).
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {metrics} from './metrics';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  /** The spoken label when the visible one is a symbol, such as ◀. */
  accessibilityLabel?: string;
  disabled?: boolean;
  /** A toggle that is on: a bar under the label, the box unchanged. */
  selected?: boolean;
  /** The one primary action of the screen: black fill. */
  primary?: boolean;
};

export function Button({
  label,
  onPress,
  accessibilityLabel,
  disabled = false,
  selected = false,
  primary = false,
}: ButtonProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{disabled, selected}}
      disabled={disabled}
      style={[
        styles.button,
        disabled && styles.disabled,
        primary && styles.primary,
      ]}
      onPress={onPress}>
      <Text style={[styles.text, primary && styles.primaryText]}>{label}</Text>
      {/* Drawn over the padding, so turning a toggle on never changes the box (brief 8.4). */}
      {selected && <View testID="selected-bar" style={styles.selectedBar} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: metrics.buttonHeight,
    minWidth: metrics.touchTarget,
    paddingHorizontal: metrics.gap,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: metrics.border,
    borderColor: metrics.ink,
    backgroundColor: metrics.paper,
  },
  disabled: {borderStyle: 'dashed'},
  primary: {backgroundColor: metrics.ink},
  text: {fontSize: metrics.bodyFont, color: metrics.ink},
  primaryText: {color: metrics.paper},
  selectedBar: {
    position: 'absolute',
    left: metrics.gap,
    right: metrics.gap,
    bottom: Math.round(metrics.gap / 2),
    height: metrics.border * 2,
    backgroundColor: metrics.ink,
  },
});
