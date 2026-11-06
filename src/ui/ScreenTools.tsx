/**
 * The Log and Close buttons every screen without its own bar carries, with the call log shown
 * only after Log (#36): the person can always read the log and leave, even when a step hangs.
 */
import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {Button} from './Button';
import {copy} from './copy';
import {LogView} from './LogView';
import {metrics} from './metrics';

export type ScreenToolsProps = {onClose: () => void};

export function ScreenTools({onClose}: ScreenToolsProps): React.JSX.Element {
  const [showLog, setShowLog] = useState(false);
  return (
    <>
      <View style={styles.bar}>
        <Button
          label={copy['action.log']}
          selected={showLog}
          onPress={() => setShowLog(!showLog)}
        />
        <Button label={copy['action.close']} onPress={onClose} />
      </View>
      {showLog && <LogView />}
    </>
  );
}

const styles = StyleSheet.create({
  bar: {flexDirection: 'row', justifyContent: 'flex-end', gap: metrics.gap},
});
