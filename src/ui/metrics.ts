/**
 * Layout metrics for the Manta (brief section 8.4), the one place they are set.
 * Layout units are density-independent: on the Manta PixelRatio is 1.875 and the window is
 * 1024 x 1365 units for 1920 x 2560 pixels (build 0.1.0 (1), #3), so millimetres are converted
 * with the runtime PixelRatio.
 */
import {PixelRatio} from 'react-native';

const SCALE = 1 / PixelRatio.get();
/** Physical pixels per millimetre on the 299 ppi Manta screen. */
const PX_PER_MM = 11.8;

const TOUCH_TARGET_MM = 10;
const BUTTON_HEIGHT_MM = 12;
const GAP_MM = 3;
const BORDER_MM = 0.3;
/** About 3.5 mm cap height, a font size near 40 px. */
const BODY_FONT_MM = 3.4;

const mm = (millimetres: number) => Math.round(millimetres * PX_PER_MM * SCALE);

export const metrics = {
  touchTarget: mm(TOUCH_TARGET_MM),
  buttonHeight: mm(BUTTON_HEIGHT_MM),
  gap: mm(GAP_MM),
  border: Math.max(1, mm(BORDER_MM)),
  bodyFont: mm(BODY_FONT_MM),
  ink: '#000000',
  paper: '#ffffff',
} as const;
