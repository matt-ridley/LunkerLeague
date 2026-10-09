/* Browsing catches one by one: opening a catch from the Fish Tank or the feed remembers that list (as it was
   filtered and sorted), so the catch page can step to the next or previous fish. Kept for the session; the router
   forgets it on any other page, so a catch opened from anywhere else shows on its own. */
const KEY = "lunker-browse";
let mem = null; // when the phone won't keep session storage

const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch { return mem; } };
const write = v => { mem = v; try { v ? sessionStorage.setItem(KEY, JSON.stringify(v)) : sessionStorage.removeItem(KEY); } catch {} };

/* Remembers the list a catch was opened from. from: "tank" or "feed". */
export const setBrowse = (ids, from) => write({ ids, from, last: null });
export const clearBrowse = () => { if (read()) write(null); };

/* Where a catch sits in the list being browsed: { i, n, prev, next } (ids, or null at either end), or null when it isn't
   in one. Catches deleted since (exists(id) false) are skipped. Pure, apart from reading the list. */
export function browseSpot(id, exists = () => true, b = read()) {
  if (!b || !Array.isArray(b.ids)) return null;
  const ids = b.ids.filter(x => x === id || exists(x)), i = ids.indexOf(id);
  if (i < 0 || ids.length < 2) return null;
  return { i, n: ids.length, prev: i > 0 ? ids[i - 1] : null, next: i < ids.length - 1 ? ids[i + 1] : null };
}

/* The catch page notes the fish showing, so going back to the list can scroll to it. */
export function markViewed(id) {
  const b = read();
  if (b && b.last !== id) write({ ...b, last: id });
}

/* The last fish viewed when coming back to the list it came from (`from`), or null. */
export function returningTo(from) {
  const b = read();
  return b && b.from === from && b.last ? b.last : null;
}

/* Back on the list: brings the last fish viewed into view once the page has drawn (looked up on the page then, since
   live data may have redrawn the list by then). */
export function scrollBackTo(id) {
  if (!id) return;
  setTimeout(() => { const a = document.querySelector(`main a[href="#/c/${id}"]`); if (a) a.scrollIntoView({ block: "center" }); }, 0);
}

/* Opening a catch from `box` remembers the list it's in (ids() gives the whole list, not just what's drawn). */
export function browseFrom(box, from, ids) {
  box.addEventListener("click", e => { if (e.target.closest('a[href^="#/c/"]')) setBrowse(ids(), from); });
}
