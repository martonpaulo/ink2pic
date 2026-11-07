/**
 * The #75 device spike's two buttons, above the call log; the results are only log lines
 * (src/flow/penProbe.ts). Removed with the spike.
 */
import React from 'react';
import {View} from 'react-native';
import {lassoLastWord, runProbe} from '../flow/penProbe';
import {Button} from './Button';
import {copy} from './copy';
import {shared} from './styles';

export function ProbeBar(): React.JSX.Element {
  return (
    <View style={shared.row}>
      <Button label={copy['probe.run']} onPress={() => runProbe()} />
      <Button label={copy['probe.lastWord']} onPress={() => lassoLastWord()} />
    </View>
  );
}
