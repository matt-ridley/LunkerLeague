/* Photos: taken with the camera or picked from the gallery, shrunk on the phone, and saved as JPEG data URLs. */
import { el } from "./ui.js";
import { openCamera } from "./camera.js";

/* Opens the camera or the gallery and resolves with the chosen File, or null if cancelled.
   The camera is the in-app viewfinder; the phone's camera app is only a fallback where that can't run. */
export async function pickImage({ camera = false, facing = "environment" } = {}) {
  if (camera) {
    const shot = await openCamera({ facing });
    if (shot !== "unavailable") return shot;
  }
  return pickFile({ camera });
}

function pickFile({ camera }) {
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

/* Decodes with the photo's EXIF rotation applied, so portrait phone shots come out upright.
   Big camera photos (50+ megapixels on some phones) are shrunk while decoding: unpacking one at full size needs
   hundreds of MB, which on Android can fail with "low memory" while the camera app is also open. */
async function decode(file, longEdge) {
  if (window.createImageBitmap) {
    const short = await shortSide(file);
    // Shrinking by width alone keeps the shape whichever way the phone was held.
    const opts = { imageOrientation: "from-image" };
    if (!short || short > longEdge) Object.assign(opts, { resizeWidth: longEdge, resizeQuality: "high" });
    try { return await createImageBitmap(file, opts); } catch {}
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch {}
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable")); };
    img.src = url;
  });
}

/* The shorter side of a JPEG in pixels, read from its header without decoding it. Null if unknown. */
async function shortSide(file) {
  try {
    const v = new DataView(await file.slice(0, 512 * 1024).arrayBuffer());
    if (v.getUint16(0) !== 0xFFD8) return null;
    let p = 2;
    while (p + 9 < v.byteLength) {
      const m = v.getUint16(p), len = v.getUint16(p + 2);
      if (m >= 0xFFC0 && m <= 0xFFCF && ![0xFFC4, 0xFFC8, 0xFFCC].includes(m)) return Math.min(v.getUint16(p + 5), v.getUint16(p + 7));
      if ((m & 0xFF00) !== 0xFF00) return null;
      p += 2 + len;
    }
  } catch {}
  return null;
}

/* Frees decoded pixels and canvases straight away instead of waiting for the browser to tidy up. */
function release(img, ...canvases) {
  if (img && img.close) img.close();
  for (const c of canvases) { c.width = 0; c.height = 0; }
}
const dims = img => [img.naturalWidth || img.width, img.naturalHeight || img.height];

/* Square crop, biased toward the top of portrait shots where faces usually are. About 20 KB. */
export async function squareAvatar(file, size = 256) {
  const img = await decode(file, size * 2);
  const [w, h] = dims(img), s = Math.min(w, h);
  const sx = (w - s) / 2, sy = h > w ? (h - s) * 0.25 : 0;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  c.getContext("2d").drawImage(img, sx, sy, s, s, 0, 0, size, size);
  const url = c.toDataURL("image/jpeg", 0.82);
  release(img, c);
  return url;
}

/* Fits the photo inside maxEdge and lowers the JPEG quality until it is under maxBytes, measured as stored: the
   data URL text is what Firestore keeps (about a third bigger than the JPEG itself). */
function fit(img, maxEdge, quality, maxBytes) {
  const [w, h] = dims(img), k = Math.min(1, maxEdge / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  let q = quality, url = c.toDataURL("image/jpeg", q);
  while (url.length > maxBytes && q > 0.35) { q -= 0.08; url = c.toDataURL("image/jpeg", q); }
  release(null, c);
  return url;
}

/* A profile cover: a 3:1 banner cropped from the middle of the photo, about 60 KB as stored. */
export async function coverPhoto(file) {
  const img = await decode(file, 2000);
  const [w, h] = dims(img);
  const sw = Math.min(w, h * 3), sh = sw / 3, sx = (w - sw) / 2, sy = (h - sh) / 2;
  const c = document.createElement("canvas");
  c.width = 1080; c.height = 360;
  c.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  let q = 0.72, url = c.toDataURL("image/jpeg", q);
  while (url.length > 60 * 1024 && q > 0.35) { q -= 0.08; url = c.toDataURL("image/jpeg", q); }
  release(img, c);
  return url;
}

/* A tackle box photo: much smaller than a catch photo (a lure doesn't need a scale read off it). A 640 px photo of about
   60 KB as stored, opened when the item is, and a 160 px thumbnail for the picker. */
export async function tacklePhoto(file) {
  const img = await decode(file, 1000);
  const out = { full: fit(img, 640, 0.7, 60 * 1024), thumb: fit(img, 160, 0.7, 12 * 1024) };
  release(img);
  return out;
}

/* A catch photo: a full version for proof (zoomable) and a small thumbnail for lists. The full one is kept to about
   240 KB as stored (it was up to ~530 KB before 0.16.0): still sharp enough to read a scale on a phone, and the free
   plan's 1 GB holds about twice as many catches. */
export async function catchPhoto(file) {
  const img = await decode(file, 1600);
  const out = { full: fit(img, 1200, 0.7, 240 * 1024), thumb: fit(img, 360, 0.7, 40 * 1024) };
  release(img);
  return out;
}
