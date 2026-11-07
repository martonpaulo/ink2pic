/**
 * The rendered host tree of a screen as one HTML page, for Chromium to lay out (#80). React Native
 * styles become CSS with React Native's flexbox defaults, as react-native-web sets them, and every
 * colour becomes one of the Manta's 16 grey levels, so the page shows only what the screen can.
 * shortcut: Chromium's flexbox and a stand-in font replace Yoga and the device font; the render is
 * a preview and the device check still decides; compare with a device photo when one disagrees.
 */
import {processColor, StyleSheet} from 'react-native';
import type {ReactTestRendererJSON} from 'react-test-renderer';

export type HostNode = ReactTestRendererJSON | string;

/** The Manta's window in layout units: 1920 x 2560 px at PixelRatio 1.875 (brief 8.4). */
export const WINDOW = {width: 1024, height: 2560 / 1.875} as const;
/** The Manta shows 16 grey levels. */
const GREY_LEVELS = 16;
const CHANNEL_MAX = 255;
/** Rec. 601 luma weights: how a colour turns into one grey. */
const LUMA = [0.299, 0.587, 0.114] as const;
/** React Native's own defaults for a text without a size or a colour. */
const DEFAULT_FONT_SIZE = 14;
/** A stand-in for the device font, which is not installed here. */
const FONT_FAMILY = "Roboto, 'Liberation Sans', Arimo, sans-serif";

/** The nearest of the 16 grey levels, as a CSS colour; transparent stays transparent. */
export function eInkColor(value: unknown): string | undefined {
  const processed = processColor(value as string);
  if (typeof processed !== 'number') {
    return undefined;
  }
  // processColor gives 0xAARRGGBB, signed on Android: read it as four bytes.
  const BYTE = CHANNEL_MAX + 1;
  const argb = (processed + BYTE ** 4) % BYTE ** 4;
  const byte = (shift: number) => Math.floor(argb / BYTE ** shift) % BYTE;
  const alpha = byte(3) / CHANNEL_MAX;
  const channels = [byte(2), byte(1), byte(0)];
  const luma = channels.reduce((sum, c, i) => sum + c * LUMA[i], 0);
  const step = CHANNEL_MAX / (GREY_LEVELS - 1);
  const grey = Math.round(Math.round(luma / step) * step);
  return alpha === 1
    ? `rgb(${grey}, ${grey}, ${grey})`
    : `rgba(${grey}, ${grey}, ${grey}, ${alpha})`;
}

const LENGTHS = new Set([
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'top',
  'left',
  'right',
  'bottom',
  'margin',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'padding',
  'paddingTop',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'gap',
  'rowGap',
  'columnGap',
  'borderWidth',
  'borderTopWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderRightWidth',
  'borderRadius',
  'fontSize',
  'lineHeight',
  'flexBasis',
]);
const COLORS = new Set([
  'color',
  'backgroundColor',
  'borderColor',
  'borderTopColor',
  'borderBottomColor',
  'borderLeftColor',
  'borderRightColor',
]);
const PASSED = new Set([
  'flexDirection',
  'flexWrap',
  'flexGrow',
  'flexShrink',
  'justifyContent',
  'alignItems',
  'alignSelf',
  'alignContent',
  'position',
  'overflow',
  'opacity',
  'zIndex',
  'display',
  'borderStyle',
  'fontWeight',
  'fontStyle',
  'textAlign',
  'fontFamily',
]);
const PAIRS: Record<string, [string, string]> = {
  paddingHorizontal: ['paddingLeft', 'paddingRight'],
  paddingVertical: ['paddingTop', 'paddingBottom'],
  marginHorizontal: ['marginLeft', 'marginRight'],
  marginVertical: ['marginTop', 'marginBottom'],
};

const kebab = (name: string) => name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
const length = (value: unknown) =>
  typeof value === 'number' ? `${value}px` : String(value);

/** One React Native style as CSS declarations. */
export function css(style: unknown): string {
  const flat: Record<string, unknown> = {
    ...((StyleSheet.flatten(style as never) as object | undefined) ?? {}),
  };
  for (const [pair, sides] of Object.entries(PAIRS)) {
    if (pair in flat) {
      for (const side of sides) {
        flat[side] ??= flat[pair];
      }
      delete flat[pair];
    }
  }
  const out: string[] = [];
  for (const [key, value] of Object.entries(flat)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (key === 'flex' && typeof value === 'number') {
      // React Native: a positive flex grows from a zero basis and may shrink (Yoga).
      out.push(
        value > 0
          ? `flex: ${value} 1 0%`
          : value < 0
          ? 'flex: 0 1 auto'
          : 'flex: 0 0 auto',
      );
    } else if (LENGTHS.has(key)) {
      out.push(`${kebab(key)}: ${length(value)}`);
    } else if (COLORS.has(key)) {
      out.push(`${kebab(key)}: ${eInkColor(value) ?? 'transparent'}`);
    } else if (PASSED.has(key)) {
      out.push(`${kebab(key)}: ${value}`);
    }
  }
  return out.join('; ');
}

const escape = (text: string) =>
  text.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);

/** A host element the person can tap: what the check measures against the touch target. */
const tappable = (props: Record<string, unknown>) =>
  props.accessibilityRole === 'button' ||
  typeof props.onClick === 'function' ||
  typeof props.onPress === 'function';

function attributes(node: ReactTestRendererJSON): string {
  const {props} = node;
  const name =
    (props.testID as string | undefined) ??
    (props.accessibilityLabel as string | undefined);
  const parts = [`data-type="${node.type}"`];
  if (name) {
    parts.push(`data-name="${escape(name)}"`);
  }
  if (tappable(props) || node.type === 'TextInput') {
    parts.push('data-target');
  }
  if (
    props.disabled === true ||
    (props.accessibilityState as {disabled?: boolean} | undefined)?.disabled
  ) {
    parts.push('aria-disabled="true"');
  }
  return parts.join(' ');
}

function pointerEvents(props: Record<string, unknown>): string {
  return props.pointerEvents === 'none' ? '; pointer-events: none' : '';
}

function element(node: HostNode, inText: boolean): string {
  if (typeof node === 'string') {
    return escape(node);
  }
  const {props, type} = node;
  const children = (node.children ?? [])
    .map(child => element(child, inText || type === 'Text'))
    .join('');
  const style = css(props.style) + pointerEvents(props);
  switch (type) {
    case 'Text':
      return `<div class="${inText ? 'inner' : 'text'}" ${attributes(
        node,
      )} style="${style}">${children}</div>`;
    case 'TextInput': {
      const value = String(props.value ?? '');
      // What the field shows: the text, or the placeholder in its own colour.
      const shown = value || String(props.placeholder ?? '');
      const color = value
        ? ''
        : `; color: ${eInkColor(props.placeholderTextColor) ?? 'inherit'}`;
      return `<div class="input" ${attributes(
        node,
      )} style="${style}"><div class="field" style="${color}">${escape(
        shown,
      )}</div></div>`;
    }
    case 'Image': {
      const source = props.source as {uri?: string} | undefined;
      const fit = String(props.resizeMode ?? 'cover');
      return `<img class="image" ${attributes(node)} src="${escape(
        source?.uri ?? '',
      )}" style="${style}; object-fit: ${fit}" alt="">`;
    }
    default:
      return `<div class="view" ${attributes(
        node,
      )} style="${style}">${children}</div>`;
  }
}

/**
 * The page: React Native's defaults, the 16-level filter for pictures and the screen's tree.
 * `zoom` draws each layout unit as that many pixels: 1.875 for the Manta's 1920 x 2560 px.
 */
export function toHtml(tree: HostNode | HostNode[] | null, zoom = 1): string {
  const roots = tree === null ? [] : Array.isArray(tree) ? tree : [tree];
  const levels = Array.from(
    {length: GREY_LEVELS},
    (_, i) => (i / (GREY_LEVELS - 1)).toFixed(4),
  ).join(' ');
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
html, body { margin: 0; background: #fff; }
#root { position: relative; display: flex; flex-direction: column; overflow: hidden;
  width: ${WINDOW.width}px; height: ${WINDOW.height}px; font-family: ${FONT_FAMILY};
  zoom: ${zoom}; }
.view, .text, .input, .image { display: flex; flex-direction: column; flex-shrink: 0;
  min-width: 0; min-height: 0; position: relative; box-sizing: border-box; margin: 0;
  padding: 0; border: 0 solid #000; }
.text { display: block; font-size: ${DEFAULT_FONT_SIZE}px; color: #000;
  white-space: pre-wrap; overflow-wrap: break-word; }
.inner { display: inline; }
.input { justify-content: center; overflow: hidden; white-space: pre; }
.field { overflow: hidden; }
.image { filter: grayscale(1) url(#levels); }
</style></head><body>
<svg width="0" height="0" style="position: absolute"><filter id="levels">
<feComponentTransfer><feFuncR type="discrete" tableValues="${levels}"/>
<feFuncG type="discrete" tableValues="${levels}"/><feFuncB type="discrete" tableValues="${levels}"/>
</feComponentTransfer></filter></svg>
<div id="root">${roots.map(root => element(root, false)).join('')}</div>
</body></html>`;
}

/** Animation the host tree asks for: a spinner, or a picture that fades in (brief 8.4). */
export function animationBreaks(tree: HostNode | HostNode[] | null): string[] {
  const found: string[] = [];
  const walk = (node: HostNode) => {
    if (typeof node === 'string') {
      return;
    }
    if (/ActivityIndicator/.test(node.type)) {
      found.push(`${node.type}: a spinner animates`);
    }
    if (node.type === 'Image' && node.props.fadeDuration !== 0) {
      found.push('Image: fades in; set fadeDuration={0}');
    }
    (node.children ?? []).forEach(walk);
  };
  (tree === null ? [] : Array.isArray(tree) ? tree : [tree]).forEach(walk);
  return found;
}
