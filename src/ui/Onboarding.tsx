/**
 * First open: three short steps and one grouped permission step (brief section 8.7). The steps
 * are static rows with dotted separators and Start the one black-filled action, as in the
 * system Settings and dialogs (#50).
 */
import React, {useRef, useState} from 'react';
import {Text, View} from 'react-native';
import {Button} from './Button';
import {ScreenTools} from './ScreenTools';
import {
  Denied,
  PermissionNeed,
  reasonsFor,
  requestMissing,
} from '../onboarding/permissions';
import {copy} from './copy';
import {Screen} from './Screen';
import {shared} from './styles';

const STEPS = [
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
    <Screen>
      <ScreenTools onClose={onClose} />
      {STEPS.map((text, i) => (
        <View key={text} style={[shared.row, shared.listRow]} accessible>
          <Text style={shared.textLarge}>{i + 1}</Text>
          <Text style={shared.text}>{text}</Text>
        </View>
      ))}
      {/* Before Start, what is missing (build 0.1.0 (11): a permission turned off later showed
          only the steps); after a denial, what stayed denied. */}
      {reasonsFor(denied.length > 0 ? denied : missing).map(reason => (
        <Text key={reason} style={shared.text}>
          {reason}
        </Text>
      ))}
      {denied.length > 0 && (
        <Text style={shared.text}>{copy['error.permission.settings']}</Text>
      )}
      {/* At the trailing edge, as OK in the system dialogs, not a black band across the page. */}
      <View style={shared.actions}>
        <Button
          label={copy['onboarding.start']}
          primary
          disabled={busy}
          onPress={start}
        />
      </View>
    </Screen>
  );
}
