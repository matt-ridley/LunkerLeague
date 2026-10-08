/* Where a catch's square thumbnail sits on its photo. Thumbnails are the whole photo, shown square (object-fit: cover),
   so a long fish held sideways loses its head and tail when cut from the middle. The angler can slide the square along
   the photo instead: catch.focus = { x, y }, each 0–100, used as the image's object-position (50 50 = the middle).
   Pure functions. */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* The square's size on the photo, as fractions of its width and height. aspect = width / height. */
const frameSize = aspect => (aspect >= 1 ? { w: 1 / aspect, h: 1 } : { w: 1, h: aspect });

/* A tap at (px, py) (fractions of the photo) → the focus that centres the square there, as near as the edges allow. */
export function focusAt(px, py, aspect) {
  const f = frameSize(aspect);
  const pos = (p, size) => (size >= 1 ? 50 : Math.round((clamp(p - size / 2, 0, 1 - size) / (1 - size)) * 100));
  return { x: pos(px, f.w), y: pos(py, f.h) };
}

/* The square on the photo for a focus: { left, top, w, h } as fractions, for drawing it over the photo. */
export function frameRect(focus, aspect) {
  const f = frameSize(aspect), fx = focus ? focus.x / 100 : 0.5, fy = focus ? focus.y / 100 : 0.5;
  return { left: (1 - f.w) * fx, top: (1 - f.h) * fy, w: f.w, h: f.h };
}

/* The middle (the default) needs nothing saved. */
export const isCentred = focus => !focus || (focus.x === 50 && focus.y === 50);

/* The style for a catch's thumbnail <img>, or null for the middle. */
export const focusStyle = c => (c && c.focus && !isCentred(c.focus) ? `object-position:${c.focus.x}% ${c.focus.y}%` : null);
