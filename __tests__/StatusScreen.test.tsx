import React from 'react';
import {Pressable} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {log, startLog} from '../src/log/memory';
import {StartingScreen} from '../src/ui/StartingScreen';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  startLog();
});

it('shows the log only after the Log button (#36)', () => {
  log('a call');
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<StartingScreen />);
  });
  expect(tree.root.findAllByProps({testID: 'log'})).toHaveLength(0);
  act(() => tree.root.findAllByType(Pressable)[0].props.onPress());
  expect(tree.root.findAllByProps({testID: 'log'}).length).toBeGreaterThan(0);
});
