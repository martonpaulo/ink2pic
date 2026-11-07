/**
 * The e-ink rules a rendered screen is checked against (brief section 8.4, #80): every target the
 * person taps is at least the touch target on both sides, no text is smaller than the minimum font
 * size (#85), and no text runs outside its own box, the boxes around it or the screen.
 * measure-page.mjs measures the page; contrast is checked in the page by the shared
 * contrast-check.mjs; animation from the host tree (html.ts).
 */

export type Box = {left: number; top: number; right: number; bottom: number};

export type Measured = {
  /** Every visible element the person can tap. */
  targets: {name: string; width: number; height: number}[];
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
export type Limits = {touchTarget: number; minFont: number};

/** Every rule break of one measured screen, as one readable line each. */
export function breaksOf(
  measured: Measured,
  {touchTarget, minFont}: Limits,
): string[] {
  const found: string[] = [];
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
    const outside = text.within.find(
      ({box}) =>
        text.glyphs.left + TOLERANCE < box.left ||
        text.glyphs.top + TOLERANCE < box.top ||
        text.glyphs.right - TOLERANCE > box.right ||
        text.glyphs.bottom - TOLERANCE > box.bottom,
    );
    if (outside) {
      found.push(`text «${text.text.slice(0, 60)}» runs outside ${outside.name}`);
    }
  }
  return found;
}
