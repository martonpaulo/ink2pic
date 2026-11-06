import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {PluginManager} from 'sn-plugin-lib';
import {
  missingPermissions,
  PERMISSIONS,
  requestMissing,
} from '../src/onboarding/permissions';
import {copy} from '../src/ui/copy';
import {metrics} from '../src/ui/metrics';
import {Onboarding} from '../src/ui/Onboarding';

const has = PluginManager.hasPermission as jest.Mock;
const request = PluginManager.requestPermission as jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

describe('permissions', () => {
  it('needs nothing when all are granted', async () => {
    has.mockResolvedValue(1);
    expect(await missingPermissions()).toEqual([]);
    expect((await requestMissing()).denied).toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });

  it('does not let a failed check block the plugin (#13, build 0.1.0 (6))', async () => {
    has.mockRejectedValue(new Error('bridge down'));
    expect(await missingPermissions()).toEqual([]);
  });

  it('requests each missing permission with its reason', async () => {
    has.mockResolvedValue(0);
    request
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    const outcome = await requestMissing();
    expect(outcome.granted.map(n => n.permission)).toEqual([
      'plugin.permission.INTERNET',
      'plugin.permission.FILE:READ',
    ]);
    expect(outcome.denied).toEqual([
      expect.objectContaining({
        permission: 'plugin.permission.FILE:WRITE',
        detail: 'answer 0',
      }),
    ]);
    expect(request).toHaveBeenCalledWith(
      'plugin.permission.INTERNET',
      copy['error.permission.internet'],
    );
  });

  it('checks the permissions at the same time (#44)', async () => {
    let answer!: (value: number) => void;
    has.mockReturnValue(new Promise(resolve => (answer = resolve)));
    const missing = missingPermissions();
    await Promise.resolve();
    expect(has).toHaveBeenCalledTimes(PERMISSIONS.length);
    answer(1);
    expect(await missing).toEqual([]);
  });

  it('trusts the host check after a request with an unknown answer (build 0.1.0 (10))', async () => {
    has.mockResolvedValueOnce(0).mockResolvedValue(1);
    request.mockResolvedValue(undefined);
    const outcome = await requestMissing();
    expect(outcome.denied).toEqual([]);
    expect(outcome.granted.map(n => n.permission)).toEqual([
      'plugin.permission.INTERNET',
    ]);
  });

  it('treats cancel and an SDK error as denied', async () => {
    has.mockResolvedValue(0);
    request.mockResolvedValueOnce(-1).mockRejectedValue(new Error('1500'));
    const {denied} = await requestMissing();
    expect(denied.map(d => d.detail)).toEqual([
      'answer -1',
      'error -1: 1500',
      'error -1: 1500',
    ]);
  });
});

describe('Onboarding', () => {
  const render = (onDone = jest.fn(), missing = PERMISSIONS) => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <Onboarding missing={missing} onDone={onDone} onClose={jest.fn()} />,
      );
    });
    return tree;
  };
  // The Start button, beside the Log and Close buttons every screen carries.
  const start = (tree: ReactTestRenderer) =>
    tree.root
      .findAllByType(Pressable)
      .find(p =>
        p
          .findAllByType(Text)
          .some(t => t.props.children === copy['onboarding.start']),
      )!;
  const texts = (tree: ReactTestRenderer) =>
    tree.root.findAllByType(Text).map(t => t.props.children);

  it('shows the three cards and the start button', () => {
    const tree = render();
    expect(texts(tree)).toEqual(
      expect.arrayContaining([
        copy['onboarding.1'],
        copy['onboarding.2'],
        copy['onboarding.3'],
        copy['onboarding.start'],
      ]),
    );
  });

  it('says where Find picture is: in the ••• menu of the lasso toolbar (#50)', () => {
    expect(copy['onboarding.3']).toBe(
      'Tap ••• on the lasso toolbar, then Find picture.',
    );
    expect(texts(render())).toContain(copy['onboarding.3']);
  });

  it('draws the steps as rows with dotted separators and Start as the one black action (#50)', () => {
    const tree = render();
    const rows = tree.root
      .findAllByType(View)
      .filter(v => v.props.accessible && v.props.accessibilityRole !== 'button')
      .map(v => StyleSheet.flatten(v.props.style));
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.borderStyle).toBe('dotted');
      expect(row.borderBottomWidth).toBeGreaterThan(0);
      expect(row.borderWidth).toBeUndefined();
    }
    const filled = tree.root
      .findAllByType(Pressable)
      .filter(
        p => StyleSheet.flatten(p.props.style).backgroundColor === metrics.ink,
      );
    expect(filled).toEqual([start(tree)]);
  });

  it('finishes when every permission is granted', async () => {
    has.mockResolvedValue(0);
    request.mockResolvedValue(2);
    const onDone = jest.fn();
    const tree = render(onDone);
    await act(() => start(tree).props.onPress());
    expect(onDone).toHaveBeenCalled();
  });

  it('runs Start once for two taps in one frame (#44)', async () => {
    has.mockResolvedValue(0);
    request.mockResolvedValue(2);
    const onDone = jest.fn();
    const tree = render(onDone);
    const button = start(tree);
    await act(async () => {
      await Promise.all([button.props.onPress(), button.props.onPress()]);
    });
    expect(request).toHaveBeenCalledTimes(PERMISSIONS.length);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('explains a denial and points to the settings', async () => {
    has.mockResolvedValue(0);
    request.mockResolvedValue(0);
    const onDone = jest.fn();
    const tree = render(onDone);
    await act(() => start(tree).props.onPress());
    expect(onDone).not.toHaveBeenCalled();
    expect(texts(tree)).toEqual(
      expect.arrayContaining([
        copy['error.permission.internet'],
        copy['error.permission.settings'],
      ]),
    );
  });

  it('names a permission turned off later before Start (build 0.1.0 (11))', () => {
    const internet = PERMISSIONS.filter(
      n => n.permission === 'plugin.permission.INTERNET',
    );
    const shown = texts(render(jest.fn(), internet));
    expect(shown).toContain(copy['error.permission.internet']);
    expect(shown).not.toContain(copy['error.permission.files']);
  });
});
