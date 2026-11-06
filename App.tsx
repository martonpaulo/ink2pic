/**
 * Spike view for issue #3: runs the probe for the pressed button, shows the report and inserts it
 * into the page as a text box, so one screenshot carries every result.
 *
 * @format
 */

import React, {useEffect, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import pluginConfig from './PluginConfig.json';
import {LASSO_BUTTON_ID} from './src/buttons';
import {insertText} from './src/sdk/note';
import {closePluginView, onButtonPress} from './src/sdk/plugin';
import {describe} from './src/sdk/result';
import {probeHost, probeNetwork, probeRecognition} from './src/spike/probes';
import {formatReport, Section} from './src/spike/report';
import {copy} from './src/ui/copy';

/** Where the report lands on a 1920 x 2560 Manta page. */
const REPORT_RECT = {left: 120, top: 160, right: 1800, bottom: 2400};
const REPORT_FONT_SIZE = 28;

async function runSpike(buttonId: number): Promise<string> {
  const sections: Section[] =
    buttonId === LASSO_BUTTON_ID
      ? [await probeRecognition()]
      : [await probeHost(), await probeNetwork()];
  const header = `Ink2Pic spike ${pluginConfig.versionName} (${
    pluginConfig.versionCode
  }), ${new Date().toISOString()}`;
  const report = formatReport(header, sections);
  const inserted = await insertText({
    text: report,
    rect: REPORT_RECT,
    fontSize: REPORT_FONT_SIZE,
  });
  return `${report}\n\n[insertText] ${describe(inserted, String)}`;
}

function App(): React.JSX.Element {
  const [report, setReport] = useState('…');

  useEffect(() => {
    return onButtonPress(({id}) => {
      setReport('…');
      runSpike(id).then(setReport, error =>
        setReport(`spike failed: ${String(error)}`),
      );
    });
  }, []);

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy['action.close']}
        style={styles.closeButton}
        onPress={() => closePluginView()}>
        <Text style={styles.closeText}>{copy['action.close']}</Text>
      </Pressable>
      <ScrollView>
        <Text style={styles.report}>{report}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, padding: 24, backgroundColor: '#ffffff'},
  closeButton: {
    alignSelf: 'flex-end',
    minHeight: 120,
    minWidth: 120,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#000000',
  },
  closeText: {fontSize: 40, color: '#000000'},
  report: {fontSize: 28, color: '#000000'},
});

export default App;
