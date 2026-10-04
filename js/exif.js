/* Reads when a JPEG photo was taken (EXIF DateTimeOriginal), as epoch ms in the phone's time zone, or null.
   Shown on catches so a late-synced entry can be checked against its photo. */
export async function photoTakenAt(file) {
  try {
    const buf = await file.slice(0, 256 * 1024).arrayBuffer();
    return parseTakenAt(new DataView(buf));
  } catch { return null; }
}

export function parseTakenAt(v) {
  if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return null; // not a JPEG
  let p = 2;
  while (p + 4 <= v.byteLength) {
    const marker = v.getUint16(p), size = v.getUint16(p + 2);
    if (marker === 0xFFE1 && v.getUint32(p + 4) === 0x45786966) return fromTiff(v, p + 10); // "Exif"
    if ((marker & 0xFF00) !== 0xFF00 || marker === 0xFFDA) return null;
    p += 2 + size;
  }
  return null;
}

function fromTiff(v, t) {
  const le = v.getUint16(t) === 0x4949;
  const u16 = o => v.getUint16(t + o, le), u32 = o => v.getUint32(t + o, le);
  const find = (ifd, tag) => {
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (u16(e) === tag) return e;
    }
    return null;
  };
  const exifPtr = find(u32(4), 0x8769);
  const entry = (exifPtr != null && find(u32(exifPtr + 8), 0x9003)) || find(u32(4), 0x0132); // DateTimeOriginal, else DateTime
  if (entry == null) return null;
  const off = u32(entry + 8);
  let s = "";
  for (let i = 0; i < 19; i++) s += String.fromCharCode(v.getUint8(t + off + i));
  const m = s.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return isNaN(d) ? null : d.getTime();
}
