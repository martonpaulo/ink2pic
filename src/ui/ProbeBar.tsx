/**
 * The #75 device spike's two buttons, above the call log; the results are log lines
 * (src/flow/penProbe.ts), and a Lasso last word that lassoed nothing says so here. Removed with
 * the spike.
 */
import React, {useState} from 'react';
import {Text, View} from 'react-native';
import {LastWordProblem, lassoLastWord, runProbe} from '../flow/penProbe';
import {Button} from './Button';
import {copy} from './copy';
import {shared} from './styles';

const PROBLEM_TEXT: Record<LastWordProblem, string> = {
  noStrokes: copy['probe.noStrokes'],
  lassoFailed: copy['probe.lassoFailed'],
};

export function ProbeBar(): React.JSX.Element {
  const [problem, setProblem] = useState<LastWordProblem | null>(null);
  return (
    <View>
      <View style={shared.row}>
        <Button label={copy['probe.run']} onPress={() => runProbe()} />
        <Button
          label={copy['probe.lastWord']}
          onPress={async () => setProblem(await lassoLastWord())}
        />
      </View>
      {problem ? (
        <Text accessibilityLiveRegion="polite" style={shared.text}>
          {PROBLEM_TEXT[problem]}
        </Text>
      ) : null}
    </View>
  );
}
