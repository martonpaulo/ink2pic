import React from 'react';
import {Pressable, Text} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {log, startLog} from '../src/log/memory';
import {copy} from '../src/ui/copy';
import {StatusScreen} from '../src/ui/StatusScreen';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  startLog();
});

const button = (tree: ReactTestRenderer, label: string) =>
  tree.root
    .findAllByType(Pressable)
    .find(p => p.findAllByType(Text).some(t => t.props.children === label))!;

it('shows the log only after the Log button, and closes (#36)', () => {
  log('a call');
  const onClose = jest.fn();
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <StatusScreen text={copy['app.starting']} onClose={onClose} />,
    );
  });
  expect(tree.root.findAllByProps({testID: 'log'})).toHaveLength(0);
  act(() => button(tree, copy['action.log']).props.onPress());
  expect(tree.root.findAllByProps({testID: 'log'}).length).toBeGreaterThan(0);
  act(() => button(tree, copy['action.close']).props.onPress());
  expect(onClose).toHaveBeenCalled();
});
