/**
 * One short line while the plugin starts, or after a start failed, with Log and Close (#36).
 * The log is still written to the session log file.
 */
import React from 'react';
import {Text} from 'react-native';
import {Screen} from './Screen';
import {ScreenTools} from './ScreenTools';
import {shared} from './styles';

export type StatusScreenProps = {text: string; onClose: () => void};

export function StatusScreen({
  text,
  onClose,
}: StatusScreenProps): React.JSX.Element {
  return (
    <Screen>
      <ScreenTools onClose={onClose} />
      <Text style={shared.text}>{text}</Text>
    </Screen>
  );
}
