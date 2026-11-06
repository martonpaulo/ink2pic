/**
 * The visual tokens for the Manta (brief section 8.4), the one place they are set. Each token
 * names a role, so calibrating one role on the device moves only that role (#53).
 * Layout units are density-independent: on the Manta PixelRatio is 1.875 and the window is
 * 1024 x 1365 units for 1920 x 2560 pixels (build 0.1.0 (1), #3), so millimetres are converted
 * with the runtime PixelRatio.
 */
import {PixelRatio} from 'react-native';

const SCALE = 1 / PixelRatio.get();
/** Physical pixels per millimetre on the 299 ppi Manta screen. */
const PX_PER_MM = 11.8;

const TOUCH_TARGET_MM = 10;
const CONTROL_HEIGHT_MM = 12;
/** The one spacing step every spacing role starts from [DEFAULT, calibrate on device]. */
const SPACE_MM = 3;
const BORDER_MM = 0.3;
/** The body font size, near 40 px; the brief's about 3.5 mm cap height describes this size. */
const BODY_FONT_SIZE_MM = 3.4;
/** The type ramp, as multiples of the body font size. */
const SMALL_FONT_RATIO = 0.5;
const LARGE_FONT_RATIO = 2;
/** The line height of the status line, as a multiple of its font size. */
const LINE_HEIGHT_RATIO = 1.3;
/** A selected toggle's bar is this many borders thick. */
const SELECTED_BAR_BORDERS = 2;

const mm = (millimetres: number) => Math.round(millimetres * PX_PER_MM * SCALE);

const space = mm(SPACE_MM);
const border = Math.max(1, mm(BORDER_MM));
const bodyFont = mm(BODY_FONT_SIZE_MM);

export const metrics = {
  touchTarget: mm(TOUCH_TARGET_MM),
  /** A button and the text field: one height, so a field and its button line up. */
  controlHeight: mm(CONTROL_HEIGHT_MM),
  border,
  selectedBarHeight: border * SELECTED_BAR_BORDERS,

  /** Between the screen's edge and its content. */
  screenPadding: space,
  /** Between the stacked parts of a screen: the bar, the status line, the grid, the page buttons. */
  sectionGap: space,
  /** Between the controls of one row. */
  controlGap: space,
  /** Inside a button or the field, before the label or text; the selected bar's inset too. */
  controlPadding: space,
  /** From a selected toggle's bar to the button's bottom edge. */
  selectedBarInset: Math.round(space / 2),
  /** Above and below the text of a list row. */
  rowPadding: space,
  /** Between the tiles of the results grid. */
  tileGap: space,

  fontSmall: bodyFont * SMALL_FONT_RATIO,
  fontBody: bodyFont,
  fontLarge: bodyFont * LARGE_FONT_RATIO,
  bodyLineHeight: Math.round(bodyFont * LINE_HEIGHT_RATIO),

  ink: '#000000',
  paper: '#ffffff',
  /** The field's placeholder: a grey that keeps 7:1 contrast on paper (interface rule 3). */
  placeholder: '#595959',
  /** Selected text in the field: a light grey, so the ink text stays readable over it. */
  selection: '#bfbfbf',
} as const;
