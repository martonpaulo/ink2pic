import {animationBreaks, css, eInkColor, toHtml} from '../scripts/renders/html';
import {breaksOf, Box, Limits, Measured} from '../scripts/renders/rules';

const box = (left: number, top: number, right: number, bottom: number): Box => ({
  left,
  top,
  right,
  bottom,
});
const screen = {name: 'the screen', box: box(0, 0, 1024, 1365)};
const limits: Limits = {touchTarget: 63, minFont: 19, screenPadding: 5};
const measured = (over: Partial<Measured>): Measured => ({
  screen: screen.box,
  targets: [],
  texts: [],
  ...over,
});

describe('renders: the Manta page (#80)', () => {
  it('shows every colour as one of the 16 grey levels', () => {
    expect(eInkColor('#000000')).toBe('rgb(0, 0, 0)');
    expect(eInkColor('#ffffff')).toBe('rgb(255, 255, 255)');
    // #595959 is 89: the nearest level is 85 (5 x 17).
    expect(eInkColor('#595959')).toBe('rgb(85, 85, 85)');
    expect(eInkColor('transparent')).toBe('rgba(0, 0, 0, 0)');
  });

  it("lays out with React Native's flex rules", () => {
    expect(css({flex: 1})).toBe('flex: 1 1 0%');
    expect(css([{paddingHorizontal: 8}, {paddingLeft: 3}])).toBe(
      'padding-left: 3px; padding-right: 8px',
    );
    expect(css({borderColor: '#000', minHeight: 63})).toBe(
      'border-color: rgb(0, 0, 0); min-height: 63px',
    );
  });

  it('marks a pressable as a target and shows an empty field with its placeholder', () => {
    const html = toHtml([
      {type: 'View', props: {accessibilityRole: 'button'}, children: null},
      {
        type: 'TextInput',
        props: {value: '', placeholder: 'Type a word', placeholderTextColor: '#595959'},
        children: null,
      },
    ]);
    expect(html.match(/data-target/g)).toHaveLength(2);
    expect(html).toContain('color: rgb(85, 85, 85)">Type a word<');
  });

  it('finds a spinner and a picture that fades in', () => {
    expect(
      animationBreaks([
        {type: 'Image', props: {fadeDuration: 0}, children: null},
        {type: 'Image', props: {}, children: null},
        {type: 'ActivityIndicator', props: {}, children: null},
      ]),
    ).toHaveLength(2);
  });
});

describe('renders: the e-ink rules (#80)', () => {
  it('passes targets of the touch target and text inside its boxes', () => {
    expect(
      breaksOf(
        measured({
          targets: [{name: 'Close', width: 63, height: 75.6, box: box(10, 10, 73, 85.6)}],
          texts: [{name: 'Close', text: 'Close', fontSize: 21, glyphs: box(10, 10, 60, 30), within: [screen]}],
        }),
        limits,
      ),
    ).toEqual([]);
  });

  it('fails a target under the touch target on either side, a disabled one too', () => {
    expect(
      breaksOf(
        measured({
          targets: [
            {name: '◀', width: 40, height: 75, box: box(10, 10, 50, 85)},
            {name: 'Search', width: 120, height: 50, box: box(60, 10, 180, 60)},
          ],
        }),
        limits,
      ),
    ).toEqual([
      'target «◀» is 40 x 75 units, under 63',
      'target «Search» is 120 x 50 units, under 63',
    ]);
  });

  it('fails text that runs outside its button or the screen', () => {
    const button = {name: '«Close»', box: box(900, 10, 1000, 80)};
    expect(
      breaksOf(
        measured({
          texts: [
            {name: 'a', text: 'Close the view', fontSize: 21, glyphs: box(905, 20, 1010, 40), within: [button, screen]},
            {name: 'b', text: 'Wide', fontSize: 21, glyphs: box(-30, 20, 40, 40), within: [screen]},
          ],
        }),
        limits,
      ),
    ).toEqual([
      '«Wide» reaches into the screen padding',
      'text «Close the view» runs outside «Close»',
      'text «Wide» runs outside the screen',
    ]);
  });

  it('fails a target or text in the screen padding, and passes one at its edge (#97)', () => {
    const bottom = screen.box.bottom - limits.screenPadding;
    expect(
      breaksOf(
        measured({
          targets: [
            {name: 'Reset all', width: 120, height: 75, box: box(800, bottom - 72, 920, bottom + 3)},
            {name: 'Cancel', width: 100, height: 75, box: box(680, bottom - 75, 780, bottom)},
          ],
          texts: [
            {name: 'Reset all', text: 'Reset all', fontSize: 21, glyphs: box(820, bottom - 40, 900, bottom + 1), within: [screen]},
            {name: 'Cancel', text: 'Cancel', fontSize: 21, glyphs: box(700, bottom - 50, 760, bottom - 30), within: [screen]},
          ],
        }),
        limits,
      ),
    ).toEqual(['«Reset all» reaches into the screen padding']);
  });

    it('fails text under the minimum font size, and passes it at the minimum (#85)', () => {
    const text = (name: string, fontSize: number) => ({
      name,
      text: name,
      fontSize,
      glyphs: box(10, 10, 60, 30),
      within: [screen],
    });
    expect(
      breaksOf(measured({texts: [text('IN USE', 10.5), text('Search', 19)]}), limits),
    ).toEqual(['text «IN USE» is 10.5 units, under 19']);
  });
});
