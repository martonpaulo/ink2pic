/**
 * One short line while the plugin starts, or after a start failed, with Log and Close (#36).
 * The log is still written to the session log file.
 */
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {ScreenTools} from './ScreenTools';
import {metrics} from './metrics';

export type StatusScreenProps = {text: string; onClose: () => void};

export function StatusScreen({
  text,
  onClose,
}: StatusScreenProps): React.JSX.Element {
  return (
    <View style={styles.screen}>
      <ScreenTools onClose={onClose} />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: metrics.paper,
    padding: metrics.gap,
    gap: metrics.gap,
  },
  text: {fontSize: metrics.bodyFont, color: metrics.ink},
});
