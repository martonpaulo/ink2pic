// Measures a rendered screen for rules.ts (#80): runs inside the page, so it is plain JavaScript
// that Babel never rewrites, read as text and evaluated by renders.render.tsx. Returns Measured.
/**
 * Self-contained, no import. Hidden elements
 * (no box, opacity 0) and elements that take no touch (pointer-events none) are left out, as the
 * person cannot see or tap them; the text of a field scrolls inside it and is left out too.
 */
export function measurePage() {
  const shown = (el) => {
    if (!el.getClientRects().length) {
      return false;
    }
    for (let e = el; e; e = e.parentElement) {
      if (Number(getComputedStyle(e).opacity) === 0) {
        return false;
      }
    }
    return true;
  };
  const nameOf = (el) =>
    el.getAttribute('data-name') ||
    (el.textContent ?? '').trim().slice(0, 40) ||
    el.getAttribute('data-type') ||
    'element';
  // Boxes in layout units: the root's zoom draws each unit as several pixels.
  const root = document.getElementById('root');
  const zoom = Number(getComputedStyle(root).zoom) || 1;
  const boxOf = (rect) => ({
    left: rect.left / zoom,
    top: rect.top / zoom,
    right: rect.right / zoom,
    bottom: rect.bottom / zoom,
  });

  const targets = [...document.querySelectorAll('[data-target]')]
    .filter(el => shown(el) && getComputedStyle(el).pointerEvents !== 'none')
    .map(el => {
      const rect = el.getBoundingClientRect();
      return {name: nameOf(el), width: rect.width / zoom, height: rect.height / zoom};
    });

  const texts = [...document.querySelectorAll('.text')]
    .filter(el => shown(el) && (el.textContent ?? '').trim() !== '')
    .map(el => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const within = [];
      for (let e = el; e && e !== root.parentElement; e = e.parentElement) {
        within.push({
          name: e === root ? 'the screen' : `«${nameOf(e)}»`,
          box: boxOf(e.getBoundingClientRect()),
        });
      }
      return {
        name: nameOf(el),
        text: (el.textContent ?? '').trim(),
        glyphs: boxOf(range.getBoundingClientRect()),
        within,
      };
    });
  return {targets, texts};
}
