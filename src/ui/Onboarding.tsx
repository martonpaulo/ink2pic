/**
 * First open: three short cards and one grouped permission step (brief section 8.7).
 */
import React, {useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Button} from './Button';
import {ScreenTools} from './ScreenTools';
import {
  Denied,
  PermissionNeed,
  reasonsFor,
  requestMissing,
} from '../onboarding/permissions';
import {copy} from './copy';
import {metrics} from './metrics';

const CARDS = [
  copy['onboarding.1'],
  copy['onboarding.2'],
  copy['onboarding.3'],
] as const;

export type OnboardingProps = {
  /** What the host reports as not granted: named before Start, not only after a denial. */
  missing: readonly PermissionNeed[];
  onDone: () => void;
  onClose: () => void;
};

export function Onboarding({
  missing,
  onDone,
  onClose,
}: OnboardingProps): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState<Denied[]>([]);

  // `busy` disables the button only after a render; two taps in one frame both pass it (#44).
  const requesting = useRef(false);

  const start = async () => {
    if (requesting.current) {
      return;
    }
    requesting.current = true;
    setBusy(true);
    const outcome = await requestMissing().finally(() => {
      requesting.current = false;
    });
    setBusy(false);
    setDenied(outcome.denied);
    if (outcome.denied.length === 0) {
      onDone();
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenTools onClose={onClose} />
      {CARDS.map((text, i) => (
        <View key={text} style={styles.card} accessible>
          <Text style={styles.number}>{i + 1}</Text>
          <Text style={styles.text}>{text}</Text>
        </View>
      ))}
      {/* Before Start, what is missing (build 0.1.0 (11): a permission turned off later showed
          only the cards); after a denial, what stayed denied. */}
      {reasonsFor(denied.length > 0 ? denied : missing).map(reason => (
        <Text key={reason} style={styles.text}>
          {reason}
        </Text>
      ))}
      {denied.length > 0 && (
        <Text style={styles.text}>{copy['error.permission.settings']}</Text>
      )}
      <Button
        label={copy['onboarding.start']}
        disabled={busy}
        onPress={start}
      />
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: metrics.gap,
    borderWidth: metrics.border,
    borderColor: metrics.ink,
    padding: metrics.gap,
  },
  number: {fontSize: metrics.bodyFont * 2, color: metrics.ink},
  text: {fontSize: metrics.bodyFont, color: metrics.ink},
});
