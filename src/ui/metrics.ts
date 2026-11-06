/**
 * Layout metrics for the Manta (brief section 8.4), the one place they are set.
 * shortcut: layout units are taken 1:1 to screen pixels [DEFAULT]; calibrate SCALE here once #3
 * reports PixelRatio and the window size on the device.
 */
const SCALE = 1;
/** Pixels per millimetre on the 299 ppi Manta screen. */
const PX_PER_MM = 11.8;

const TOUCH_TARGET_MM = 10;
const BUTTON_HEIGHT_MM = 12;
const TILE_WIDTH_MM = 75;
const TILE_HEIGHT_MM = 60;
const GAP_MM = 3;
const BORDER_MM = 0.3;
/** About 3.5 mm cap height, a font size near 40 px. */
const BODY_FONT_MM = 3.4;

const mm = (millimetres: number) => Math.round(millimetres * PX_PER_MM * SCALE);

export const metrics = {
  touchTarget: mm(TOUCH_TARGET_MM),
  buttonHeight: mm(BUTTON_HEIGHT_MM),
  tileWidth: mm(TILE_WIDTH_MM),
  tileHeight: mm(TILE_HEIGHT_MM),
  gap: mm(GAP_MM),
  border: Math.max(1, mm(BORDER_MM)),
  bodyFont: mm(BODY_FONT_MM),
  ink: '#000000',
  paper: '#ffffff',
} as const;
