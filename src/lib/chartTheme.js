/**
 * Helpers so canvas-based charts (Chart.js) can read design-system colors
 * and re-render when the user toggles light/dark.
 *
 * SVG/D3 charts don't need this — they reference CSS variables directly and
 * recolor automatically. Chart.js bakes colors into the canvas, so those
 * charts must subscribe to `themechange` and rebuild.
 */

/** Read a CSS custom property's computed value, e.g. cssVar('--color-accent'). */
export function cssVar(name, el = document.documentElement) {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

/** The categorical data-viz ramp as an array of CSS colors. */
export function vizPalette() {
  return [1, 2, 3, 4, 5, 6].map((n) => cssVar(`--viz-${n}`));
}

/**
 * Run `cb` now is the caller's job; this only wires up future theme changes.
 * Returns an unsubscribe function.
 */
export function onThemeChange(cb) {
  window.addEventListener('themechange', cb);
  return () => window.removeEventListener('themechange', cb);
}

/** Convert a hex/rgb color + alpha into an rgba() string (for fills). */
export function withAlpha(color, alpha) {
  // Accepts #rrggbb or already-rgb()/rgba(); falls back to color-mix-free rgba.
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}
