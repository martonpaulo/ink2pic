// Rendered contrast check for interface standard rule 3 (#585). Runs inside the page: pass the
// function itself to Playwright's `page.evaluate(contrastCheck, options)`, or send
// `(${contrastCheck})(${JSON.stringify(options)})` through CDP `Runtime.evaluate` with
// `returnByValue: true`. It is self-contained, so it survives that serialization; it uses no import.
//
// It measures what the browser computed for the current colour scheme, so run it once per scheme
// (Playwright `colorScheme`, or CDP `Emulation.setEmulatedMedia`). Thresholds are WCAG 2.2:
// SC 1.4.3 for text (4.5:1, 3:1 for large text) and SC 1.4.11 for the parts of a control (3:1).
// SC 1.4.3 exempts the text of an inactive user interface component, so an element that is
// disabled, inside a disabled fieldset (outside its first legend), or under aria-disabled="true" is
// not checked, for text or for its focus ring (#633).
//
// options.parts: [{ name, foreground: { selector, pseudo?, property? }, background: { … } }]
//   control parts to compare, such as a switch knob against its track; property defaults to
//   background-color. Every element the foreground selector matches is checked.
// options.focusRings: true (default) focuses each focusable element and compares an `outline`
//   ring with the surface behind the element. A ring drawn with box-shadow is listed as unmeasured.
// options.canvas: the colour under the root when no ancestor paints one (default: white).
//
// Returns { failures: [{ kind, selector, text?, ratio, required, foreground, background }],
//           unmeasured: [{ kind, selector, reason }] }. A pair the function cannot compute, such as
// text over a gradient or an image, is unmeasured, never passed.
export function contrastCheck(options = {}) {
  const parts = options.parts || [];
  const canvas = options.canvas || "rgb(255, 255, 255)";

  const parse = (value) => {
    const n = (value.match(/-?[\d.]+/g) || []).map(Number);
    if (value.startsWith("color(srgb")) return [n[0] * 255, n[1] * 255, n[2] * 255, n.length > 3 ? n[3] : 1];
    return [n[0] || 0, n[1] || 0, n[2] || 0, n.length > 3 ? n[3] : 1];
  };
  // Source over destination; both are [r, g, b, a] with a in 0..1.
  const over = (top, bottom) => {
    const a = top[3] + bottom[3] * (1 - top[3]);
    if (a === 0) return [0, 0, 0, 0];
    const mix = (i) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a;
    return [mix(0), mix(1), mix(2), a];
  };
  const luminance = ([r, g, b]) => {
    const channel = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const ratio = (a, b) => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return Math.round(((high + 0.05) / (low + 0.05)) * 100) / 100;
  };
  const css = (c) => `rgb(${c.slice(0, 3).map((v) => Math.round(v)).join(", ")})`;

  const selectorOf = (el) => {
    const path = [];
    for (let e = el; e && e.nodeType === 1 && e !== document.documentElement; e = e.parentElement) {
      if (e.id) { path.unshift("#" + CSS.escape(e.id)); break; }
      let step = e.localName;
      const classes = [...e.classList].slice(0, 2).map((c) => "." + CSS.escape(c)).join("");
      step += classes;
      const parent = e.parentElement;
      if (parent && [...parent.children].filter((s) => s.localName === e.localName).length > 1) {
        step += `:nth-of-type(${[...parent.children].filter((s) => s.localName === e.localName).indexOf(e) + 1})`;
      }
      path.unshift(step);
    }
    return path.join(" > ");
  };

  // The colour painted behind `el`, composited from the nearest opaque ancestor up to `el`.
  // Returns { colour } or { reason } when an image or gradient sits in the stack.
  const backdrop = (el, includeSelf = true) => {
    const layers = [];
    for (let e = includeSelf ? el : el.parentElement; e; e = e.parentElement) {
      const style = getComputedStyle(e);
      if (style.backgroundImage !== "none") return { reason: `background image or gradient on ${selectorOf(e) || e.localName}` };
      const colour = parse(style.backgroundColor);
      if (colour[3] > 0) layers.push(colour);
      if (colour[3] >= 1) break;
    }
    let result = parse(canvas);
    for (let i = layers.length - 1; i >= 0; i--) result = over(layers[i], result);
    return { colour: result };
  };
  // The product of every ancestor's opacity, which fades text toward what is behind it.
  const opacityOf = (el) => {
    let value = 1;
    for (let e = el; e; e = e.parentElement) value *= Number(getComputedStyle(e).opacity);
    return value;
  };
  const visible = (el) => {
    if (!el.getClientRects().length) return false;
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none" && opacityOf(el) > 0;
  };
  const isLarge = (style) => {
    const size = parseFloat(style.fontSize);
    return size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
  };

  const failures = [];
  const unmeasured = [];
  const inactive = (el) => {
    if (el.disabled || el.closest("[aria-disabled='true']")) return true;
    const fieldset = el.closest("fieldset[disabled]");
    if (!fieldset) return false;
    const legend = fieldset.querySelector(":scope > legend");
    return !(legend && legend.contains(el));
  };

  // Text: every visible element with its own text.
  for (const el of document.querySelectorAll("body, body *")) {
    if (["script", "style", "noscript", "template"].includes(el.localName)) continue;
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim();
    if (!text || !visible(el) || inactive(el)) continue;
    const style = getComputedStyle(el);
    const behind = backdrop(el);
    if (behind.reason) { unmeasured.push({ kind: "text", selector: selectorOf(el), reason: behind.reason }); continue; }
    const fg = parse(style.color);
    fg[3] *= opacityOf(el);
    const shown = over(fg, behind.colour);
    const large = isLarge(style);
    const required = large ? 3 : 4.5;
    const value = ratio(shown, behind.colour);
    if (value < required) {
      failures.push({ kind: large ? "large-text" : "text", selector: selectorOf(el), text: text.slice(0, 60), ratio: value, required, foreground: css(shown), background: css(behind.colour) });
    }
  }

  // Control parts: a declared foreground against a declared background, 3:1.
  const read = (el, side) => parse(getComputedStyle(el, side.pseudo || null).getPropertyValue(side.property || "background-color"));
  for (const part of parts) {
    for (const fgEl of document.querySelectorAll(part.foreground.selector)) {
      if (!visible(fgEl)) continue;
      const bgEl = part.background.selector ? (fgEl.closest(part.background.selector) || document.querySelector(part.background.selector)) : fgEl;
      if (!bgEl) { unmeasured.push({ kind: "part", selector: selectorOf(fgEl), reason: `${part.name}: no element for ${part.background.selector}` }); continue; }
      const surface = backdrop(bgEl, false);
      if (surface.reason) { unmeasured.push({ kind: "part", selector: selectorOf(fgEl), reason: `${part.name}: ${surface.reason}` }); continue; }
      const background = over(read(bgEl, part.background), surface.colour);
      const foreground = over(read(fgEl, part.foreground), background);
      const value = ratio(foreground, background);
      if (value < 3) failures.push({ kind: "part", selector: selectorOf(fgEl), text: part.name, ratio: value, required: 3, foreground: css(foreground), background: css(background) });
    }
  }

  // Focus rings: focus each focusable element and compare its outline with the surface behind it.
  if (options.focusRings !== false) {
    const previous = document.activeElement;
    const focusable = "a[href], button, input:not([type=hidden]), select, textarea, summary, [tabindex]:not([tabindex='-1'])";
    for (const el of document.querySelectorAll(focusable)) {
      if (!visible(el) || inactive(el)) continue;
      el.focus({ focusVisible: true });
      if (document.activeElement !== el) continue;
      const style = getComputedStyle(el);
      if (style.outlineStyle === "none" || parseFloat(style.outlineWidth) === 0) {
        if (style.boxShadow !== "none") unmeasured.push({ kind: "focus-ring", selector: selectorOf(el), reason: "focus ring drawn with box-shadow" });
        continue;
      }
      // An outline sits outside the element by default, over what is behind it.
      const surface = parseFloat(style.outlineOffset) >= 0 ? backdrop(el, false) : backdrop(el);
      if (surface.reason) { unmeasured.push({ kind: "focus-ring", selector: selectorOf(el), reason: surface.reason }); continue; }
      const ring = over(parse(style.outlineColor), surface.colour);
      const value = ratio(ring, surface.colour);
      if (value < 3) failures.push({ kind: "focus-ring", selector: selectorOf(el), ratio: value, required: 3, foreground: css(ring), background: css(surface.colour) });
    }
    if (previous && previous.focus) previous.focus(); else document.activeElement?.blur?.();
  }

  return { failures, unmeasured };
}
