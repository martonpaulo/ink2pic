/** The one bordered button of every screen: black on white, at least a touch target high. */
import React from 'react';
import {Pressable, StyleSheet, Text} from 'react-native';
import {metrics} from './metrics';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  /** The spoken label when the visible one is a symbol, such as ◀. */
  accessibilityLabel?: string;
  disabled?: boolean;
  selected?: boolean;
};

export function Button({
  label,
  onPress,
  accessibilityLabel,
  disabled = false,
  selected = false,
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
        selected && styles.selected,
      ]}
      onPress={onPress}>
      <Text style={[styles.text, selected && styles.selectedText]}>
        {label}
      </Text>
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
  selected: {backgroundColor: metrics.ink},
  text: {fontSize: metrics.bodyFont, color: metrics.ink},
  selectedText: {color: metrics.paper},
});
