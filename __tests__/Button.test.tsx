/** Black fill is the one primary action; a selected toggle keeps its box and gains a bar (#50). */
import React from 'react';
import {Pressable, StyleSheet, Text} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {Button, ButtonProps} from '../src/ui/Button';
import {metrics} from '../src/ui/metrics';

function render(props: Partial<ButtonProps> = {}) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <Button label="Library" onPress={jest.fn()} {...props} />,
    );
  });
  return tree;
}
const boxStyle = (tree: ReactTestRenderer) =>
  StyleSheet.flatten(tree.root.findByType(Pressable).props.style);
const textStyle = (tree: ReactTestRenderer) =>
  StyleSheet.flatten(tree.root.findByType(Text).props.style);
const bars = (tree: ReactTestRenderer) =>
  tree.root.findAll(
    n => n.props.testID === 'selected-bar' && !n.props.children,
  );

describe('Button (#50)', () => {
  it('fills only the primary action black', () => {
    const primary = render({primary: true});
    expect(boxStyle(primary).backgroundColor).toBe(metrics.ink);
    expect(textStyle(primary).color).toBe(metrics.paper);
    expect(boxStyle(render()).backgroundColor).toBe(metrics.paper);
  });

  it('marks a selected toggle with a bar under the label, not a black fill', () => {
    const selected = render({selected: true});
    expect(boxStyle(selected).backgroundColor).toBe(metrics.paper);
    expect(textStyle(selected).color).toBe(metrics.ink);
    expect(bars(selected).length).toBeGreaterThan(0);
    expect(
      selected.root.findByType(Pressable).props.accessibilityState,
    ).toMatchObject({selected: true});
    expect(bars(render())).toHaveLength(0);
  });

  it('keeps the same box when selected, so e-ink repaints no layout', () => {
    expect(boxStyle(render({selected: true}))).toEqual(boxStyle(render()));
    const bar = StyleSheet.flatten(
      bars(render({selected: true}))[0].props.style,
    );
    expect(bar.position).toBe('absolute');
  });
});
