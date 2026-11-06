/**
 * The screen while the plugin starts: one short line, with the call log behind the Log button
 * only (#36). The log is still written to the session log file.
 */
import React, {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Button} from './Button';
import {copy} from './copy';
import {LogView} from './LogView';
import {metrics} from './metrics';

export function StartingScreen(): React.JSX.Element {
  const [showLog, setShowLog] = useState(false);
  return (
    <View style={styles.screen}>
      <View style={styles.bar}>
        <Text style={styles.text}>{copy['app.starting']}</Text>
        <Button
          label={copy['action.log']}
          selected={showLog}
          onPress={() => setShowLog(!showLog)}
        />
      </View>
      {showLog && <LogView />}
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
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  text: {fontSize: metrics.bodyFont, color: metrics.ink},
});
