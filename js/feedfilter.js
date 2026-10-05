/* Feed filters and sort. Pure functions on plain data, so they can be tested without the app.
   A filter is { q (words in notes or spot name), angler, species, show, when, derby, sort }; NO_FILTERS is "show everything, newest first". */
import { isPersonalBest, recordKinds, measured } from "./stats.js";

export const NO_FILTERS = { q: "", angler: "", species: "", show: "all", when: "any", derby: "", sort: "new" };

export const SHOW = [["all", "Everything"], ["catches", "Catches only"], ["news", "News only"], ["records", "Records & PBs"], ["past", "Throwbacks (past catches)"]];
export const WHEN = [["any", "Any time"], ["today", "Today"], ["7d", "Last 7 days"], ["30d", "Last 30 days"], ["year", "This year"]];
export const SORT = [["new", "Newest"], ["heavy", "Heaviest"], ["long", "Longest"]];

const DAY = 24 * 3600 * 1000;
/* The earliest time a `when` choice lets in. */
export function sinceOf(when, now = Date.now()) {
  const d = new Date(now);
  if (when === "today") return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (when === "7d") return now - 7 * DAY;
  if (when === "30d") return now - 30 * DAY;
  if (when === "year") return new Date(d.getFullYear(), 0, 1).getTime();
  return -Infinity;
}

/* How many filters are in use. `q` is "notes or spot contains". */
export const activeCount = f => ["angler", "species", "show", "when", "derby", "sort"].filter(k => f[k] !== NO_FILTERS[k]).length + (f.q.trim() ? 1 : 0);

const words = q => q.toLowerCase().split(/\s+/).filter(Boolean);
const matches = (text, ws) => { const t = text.toLowerCase(); return ws.every(w => t.includes(w)); };

/* Narrows the feed. Returns { catches, onCard, loose }: the catches to show (sorted when sort isn't "new"), the news
   to show on each shown catch's card (cid -> [news]), and the news that gets a card of its own. News gets its own card only when the
   filters don't narrow to something only catches have (a species, records, throwbacks, words in notes, a sort by size). */
export function filterFeed({ catches, news, f, now = Date.now() }) {
  const angler = f.angler, ws = words(f.q), since = sinceOf(f.when, now);
  let cs = catches.filter(c =>
    (!angler || c.uid === angler)
    && (!f.species || c.species === f.species)
    && (!f.derby || c.derbyId === f.derby)
    && c.caughtAt >= since
    && (f.show !== "records" || isPersonalBest(c, catches) || recordKinds(c, catches).length > 0)
    && (f.show !== "past" || c.past)
    && (!ws.length || matches(`${c.notes || ""} ${c.locShared ? c.spotName || "" : ""}`, ws)));
  if (f.show === "news") cs = [];
  if (f.sort === "heavy") cs = cs.filter(c => measured(c) && c.weightOz > 0).sort((a, b) => b.weightOz - a.weightOz);
  if (f.sort === "long") cs = cs.filter(c => measured(c) && c.lengthIn > 0).sort((a, b) => b.lengthIn - a.lengthIn);

  const ids = new Set(cs.map(c => c.id)), onCard = new Map(), loose = [];
  const ownCards = f.sort === "new" && ["all", "news"].includes(f.show) && !f.species && !ws.length;
  for (const e of news) {
    if (e.cid && ids.has(e.cid)) { onCard.set(e.cid, [...(onCard.get(e.cid) || []), e]); continue; }
    if (!ownCards || (angler && !e.uids.includes(angler)) || e.at < since) continue;
    if (f.derby && e.id !== `derby:${f.derby}`) continue;
    loose.push(e);
  }
  return { catches: cs, onCard, loose };
}
