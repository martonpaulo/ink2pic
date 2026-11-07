/**
 * The one tool bar at the top of every screen: the screen's own controls, then Log and Close at
 * the trailing edge, so the person can always read the log and leave, even when a step hangs (#36).
 */
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Button} from './Button';
import {copy} from './copy';
import {shared} from './styles';

export type ToolBarProps = {
  /** The log is shown: Log carries its selected bar. */
  logShown: boolean;
  onLog: () => void;
  onClose: () => void;
  /** The screen's title, a header after the screen's own controls; it takes the free width. */
  title?: string;
  /** The screen's own controls, before the title, Log and Close. */
  children?: React.ReactNode;
};

export function ToolBar({
  logShown,
  onLog,
  onClose,
  title,
  children,
}: ToolBarProps): React.JSX.Element {
  return (
    <View style={shared.actions}>
      {children}
      {title !== undefined && (
        <Text
          accessibilityRole="header"
          style={[shared.textLarge, styles.title]}>
          {title}
        </Text>
      )}
      <Button label={copy['action.log']} selected={logShown} onPress={onLog} />
      <Button label={copy['action.close']} onPress={onClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  title: {flex: 1},
});
