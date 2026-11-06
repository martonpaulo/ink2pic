/** The call log, updated line by line (owner's logging rule, AGENTS.md). */
import React, {useEffect, useState} from 'react';
import {StyleSheet, Text} from 'react-native';
import {logLines, onLog} from '../log/memory';
import {metrics} from './metrics';

export function LogView(): React.JSX.Element {
  const [lines, setLines] = useState<string[]>(logLines);
  useEffect(() => onLog(setLines), []);
  return (
    <Text testID="log" style={styles.log}>
      {lines.join('\n')}
    </Text>
  );
}

const styles = StyleSheet.create({
  log: {fontSize: metrics.bodyFont / 2, color: metrics.ink},
});
