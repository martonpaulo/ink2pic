/**
 * The e-ink rules a rendered screen is checked against (brief section 8.4, #80): every target the
 * person taps is at least the touch target on both sides, no text is smaller than the minimum font
 * size (#85), no text runs outside its own box, the boxes around it or the screen, and every
 * target and text stays inside the screen padding, so nothing touches the edge (#97).
 * measure-page.mjs measures the page; contrast is checked in the page by the shared
 * contrast-check.mjs; animation from the host tree (html.ts).
 */

export type Box = {left: number; top: number; right: number; bottom: number};

export type Measured = {
  /** The screen's box. */
  screen: Box;
  /** Every visible element the person can tap. */
  targets: {name: string; width: number; height: number; box: Box}[];
  /**
   * Every visible text: its smallest font size in units, the box of its glyphs, and the boxes it
   * must stay inside.
   */
  texts: {
    name: string;
    text: string;
    fontSize: number;
    glyphs: Box;
    within: {name: string; box: Box}[];
  }[];
};

/** A rendered edge may land a fraction of a unit off; a real break is larger. */
const TOLERANCE = 0.5;

/** The sizes, in layout units, a screen must keep (metrics.ts). */
export type Limits = {touchTarget: number; minFont: number; screenPadding: number};

/** True when `inner` reaches past `outer` by more than the tolerance. */
const outside = (inner: Box, outer: Box) =>
  inner.left + TOLERANCE < outer.left ||
  inner.top + TOLERANCE < outer.top ||
  inner.right - TOLERANCE > outer.right ||
  inner.bottom - TOLERANCE > outer.bottom;

/** Every rule break of one measured screen, as one readable line each. */
export function breaksOf(
  measured: Measured,
  {touchTarget, minFont, screenPadding}: Limits,
): string[] {
  const found: string[] = [];
  const {screen} = measured;
  const inside: Box = {
    left: screen.left + screenPadding,
    top: screen.top + screenPadding,
    right: screen.right - screenPadding,
    bottom: screen.bottom - screenPadding,
  };
  // A target and the text inside it are named once.
  const intruders = new Set(
    [
      ...measured.targets.map(({name, box}) => ({name, box})),
      ...measured.texts.map(({text, glyphs}) => ({name: text.slice(0, 60), box: glyphs})),
    ]
      .filter(({box}) => outside(box, inside))
      .map(({name}) => name),
  );
  for (const name of intruders) {
    found.push(`«${name}» reaches into the screen padding`);
  }
  for (const target of measured.targets) {
    if (target.width + TOLERANCE < touchTarget || target.height + TOLERANCE < touchTarget) {
      found.push(
        `target «${target.name}» is ${Math.round(target.width)} x ${Math.round(
          target.height,
        )} units, under ${touchTarget}`,
      );
    }
  }
  for (const text of measured.texts) {
    if (text.fontSize + TOLERANCE < minFont) {
      found.push(
        `text «${text.text.slice(0, 60)}» is ${text.fontSize} units, under ${minFont}`,
      );
    }
    const around = text.within.find(({box}) => outside(text.glyphs, box));
    if (around) {
      found.push(`text «${text.text.slice(0, 60)}» runs outside ${around.name}`);
    }
  }
  return found;
}
