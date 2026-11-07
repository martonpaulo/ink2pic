/** The call log, updated line by line (owner's logging rule, AGENTS.md). */
import React, {useEffect, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {logLines, onLog} from '../log/memory';
import {copy} from './copy';
import {ProbeBar} from './ProbeBar';
import {shared} from './styles';

/**
 * Lines shown: the newest, at the bottom (#45). The view has no scroll on e-ink, so older lines
 * stay in session.log; a line that wraps pushes the oldest shown line out at the top. At the body
 * size (#85) 30 lines and a few wrapped ones fill the frame without a line cut at the top.
 */
export const LOG_VIEW_LINES = 30;

export function LogView(): React.JSX.Element {
  const [lines, setLines] = useState<string[]>(logLines);
  useEffect(() => onLog(setLines), []);
  return (
    <>
      {/* Outside the clipped frame, so a long log never hides it (#75 spike). */}
      <ProbeBar />
      <Text style={shared.text}>{copy['log.about']}</Text>
      <View style={styles.frame}>
        <Text testID="log" style={shared.text}>
          {lines.slice(-LOG_VIEW_LINES).join('\n')}
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  // Clipped at the top, so the newest line stays in sight when the lines need more room.
  frame: {flexShrink: 1, overflow: 'hidden', justifyContent: 'flex-end'},
});
