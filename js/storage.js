/* How much of the free plan's 1 GiB of Firestore storage the league uses, and how many more catches fit.
   Full photos are by far the biggest part. Each photo saves its size (`bytes`), and the server adds those up, so no
   photo has to be downloaded. Photos saved before sizes were recorded are estimated. Everything else (catches with
   their small photos, comments, members…) is measured from the copy already on this phone. It's an estimate:
   Firestore also counts index entries and a little per document. Pure functions. */

export const FREE_BYTES = 1024 ** 3;           // Spark plan: 1 GiB stored
const OLD_PHOTO_BYTES = 400 * 1024;           // photos saved before 0.16.0 (up to ~530 KB each as stored)
const NEW_PHOTO_BYTES = 230 * 1024;           // a typical new full photo, until there are enough real ones
const DOC_OVERHEAD = 100;                     // document name and bookkeeping, roughly
const INDEX_FACTOR = 1.1;                     // index entries and other overhead on top of the data

/* Rough stored size of documents already on this phone: [doc data objects]. */
export function docsBytes(docs) {
  let n = 0;
  for (const d of docs) n += JSON.stringify(d).length + DOC_OVERHEAD;
  return n;
}

/* photos: { total, sized, sizedBytes, tackleBytes } from the server (tackleBytes: tackle box photos, counted as used
   but not as part of a catch); docs: bytes of everything else; catches: how many catches.
   Returns { used, pct, perCatch, catchesLeft }. */
export function estimateStorage({ photos, docs, catches }) {
  const unsized = Math.max(0, photos.total - photos.sized);
  const photoBytes = photos.sizedBytes + unsized * OLD_PHOTO_BYTES;
  const used = Math.round((photoBytes + (photos.tackleBytes || 0) + docs) * INDEX_FACTOR);
  const newPhoto = photos.sized >= 5 ? photos.sizedBytes / photos.sized : NEW_PHOTO_BYTES;
  const docPerCatch = catches ? docs / catches : 45 * 1024; // the catch with its small photo, plus its share of the rest
  const perCatch = Math.round((newPhoto + docPerCatch) * INDEX_FACTOR);
  return { used, pct: Math.min(100, Math.round((used / FREE_BYTES) * 1000) / 10), perCatch, catchesLeft: Math.max(0, Math.floor((FREE_BYTES - used) / perCatch)) };
}

export const fmtBytes = n => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : n >= 1024 ** 2 ? `${Math.round(n / 1024 ** 2)} MB` : `${Math.round(n / 1024)} KB`);
