/* Photos: taken with the camera or picked from the gallery, shrunk on the phone, and saved as JPEG data URLs. */
import { el } from "./ui.js";

/* Opens the camera (capture) or the gallery and resolves with the chosen File, or null if cancelled. */
export function pickImage({ camera = false } = {}) {
  return new Promise(resolve => {
    const input = el("input", { type: "file", accept: "image/*", hidden: true });
    if (camera) input.setAttribute("capture", "environment");
    let done = false;
    const finish = f => { if (done) return; done = true; input.remove(); resolve(f); };
    input.addEventListener("change", () => finish(input.files && input.files[0] || null));
    input.addEventListener("cancel", () => finish(null));
    document.body.append(input);
    input.click();
  });
}

/* Decodes with the photo's EXIF rotation applied, so portrait phone shots come out upright. */
async function decode(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch {}
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable")); };
    img.src = url;
  });
}
const dims = img => [img.naturalWidth || img.width, img.naturalHeight || img.height];

/* Square crop, biased toward the top of portrait shots where faces usually are. About 20 KB. */
export async function squareAvatar(file, size = 256) {
  const img = await decode(file);
  const [w, h] = dims(img), s = Math.min(w, h);
  const sx = (w - s) / 2, sy = h > w ? (h - s) * 0.25 : 0;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  c.getContext("2d").drawImage(img, sx, sy, s, s, 0, 0, size, size);
  return c.toDataURL("image/jpeg", 0.82);
}

/* Fits the photo inside maxEdge and lowers the JPEG quality until it is under maxBytes. */
function fit(img, maxEdge, quality, maxBytes) {
  const [w, h] = dims(img), k = Math.min(1, maxEdge / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  let q = quality, url = c.toDataURL("image/jpeg", q);
  while (url.length * 0.75 > maxBytes && q > 0.35) { q -= 0.08; url = c.toDataURL("image/jpeg", q); }
  return url;
}

/* A catch photo: a full version for proof (zoomable) and a small thumbnail for lists. */
export async function catchPhoto(file) {
  const img = await decode(file);
  return { full: fit(img, 1280, 0.72, 400 * 1024), thumb: fit(img, 360, 0.7, 30 * 1024) };
}
