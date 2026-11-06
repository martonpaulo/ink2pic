import React from 'react';
import {Pressable, Text} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {PluginManager} from 'sn-plugin-lib';
import {
  missingPermissions,
  needsOnboarding,
  requestMissing,
} from '../src/onboarding/permissions';
import {copy} from '../src/ui/copy';
import {Onboarding} from '../src/ui/Onboarding';

const has = PluginManager.hasPermission as jest.Mock;
const request = PluginManager.requestPermission as jest.Mock;

beforeEach(() => jest.resetAllMocks());

describe('permissions', () => {
  it('needs nothing when all are granted', async () => {
    has.mockResolvedValue(1);
    expect(await needsOnboarding()).toBe(false);
    expect((await requestMissing()).denied).toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });

  it('counts a failed check as missing', async () => {
    has.mockRejectedValue(new Error('bridge down'));
    expect(await missingPermissions()).toHaveLength(3);
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
  const render = (onDone = jest.fn()) => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Onboarding onDone={onDone} />);
    });
    return tree;
  };
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

  it('finishes when every permission is granted', async () => {
    has.mockResolvedValue(0);
    request.mockResolvedValue(2);
    const onDone = jest.fn();
    const tree = render(onDone);
    await act(() => tree.root.findByType(Pressable).props.onPress());
    expect(onDone).toHaveBeenCalled();
  });

  it('explains a denial and points to the settings', async () => {
    has.mockResolvedValue(0);
    request.mockResolvedValue(0);
    const onDone = jest.fn();
    const tree = render(onDone);
    await act(() => tree.root.findByType(Pressable).props.onPress());
    expect(onDone).not.toHaveBeenCalled();
    expect(texts(tree)).toEqual(
      expect.arrayContaining([
        copy['error.permission.internet'],
        copy['error.permission.settings'],
      ]),
    );
  });
});
