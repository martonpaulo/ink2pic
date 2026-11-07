/** The styles every screen repeats, built from the tokens in metrics.ts (#53). */
import {StyleSheet} from 'react-native';
import {metrics} from './metrics';

export const shared = StyleSheet.create({
  /** The outer view of every screen. */
  screen: {
    flex: 1,
    backgroundColor: metrics.paper,
    padding: metrics.screenPadding,
    gap: metrics.sectionGap,
  },
  /** The thick ink border of a button, a tile and the field (brief 8.4). */
  outline: {borderWidth: metrics.border, borderColor: metrics.ink},
  /** A row of controls. */
  row: {flexDirection: 'row', alignItems: 'center', gap: metrics.controlGap},
  text: {fontSize: metrics.fontBody, color: metrics.ink},
  textLarge: {fontSize: metrics.fontLarge, color: metrics.ink},
});
