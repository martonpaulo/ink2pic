/** The #75 spike's controls: hidden behind PROBE_CONTROLS, and never silent while armed. */
import React from 'react';
import {PluginManager} from 'sn-plugin-lib';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {PROBE_CONTROLS} from '../src/config';
import {probeArmed, stopPenProbe} from '../src/flow/penProbe';
import {ProbeBar} from '../src/ui/ProbeBar';
import {copy} from '../src/ui/copy';

const mocked = (fn: unknown) => fn as jest.Mock;
const remove = () => ({remove: jest.fn()});

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  mocked(PluginManager.registerEventListener).mockImplementation(remove);
  mocked(PluginManager.registerMotionListener).mockImplementation(remove);
  mocked(PluginManager.registerPluginLifeListener).mockImplementation(remove);
});

afterEach(() => stopPenProbe());

const labels = (tree: ReactTestRenderer) =>
  tree.root
    .findAll(node => typeof node.props.label === 'string')
    .map(node => node.props.label as string);

it('stays on for build 16, where the owner tests the probe', () => {
  expect(PROBE_CONTROLS).toBe(true);
});

it('shows nothing when the probe controls are off', async () => {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ProbeBar enabled={false} />);
  });
  expect(tree.toJSON()).toBeNull();
});

it('shows «Probe on» with Stop probe while armed, and Stop probe stops it', async () => {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ProbeBar />);
  });
  expect(labels(tree)).not.toContain(copy['probe.stop']);
  const run = tree.root.find(node => node.props.label === copy['probe.run']);
  await act(async () => {
    await run.props.onPress();
  });
  expect(probeArmed()).toBe(true);
  expect(JSON.stringify(tree.toJSON())).toContain(copy['probe.on']);
  const stop = tree.root.find(node => node.props.label === copy['probe.stop']);
  await act(async () => stop.props.onPress());
  expect(probeArmed()).toBe(false);
  expect(labels(tree)).not.toContain(copy['probe.stop']);
});
