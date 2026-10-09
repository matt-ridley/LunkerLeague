/* The Fish Tank: every catch in the league as a photo wall, filtered and sorted your way. Pure functions on plain
   data, so they can be tested without the app. A filter is NO_TANK's shape; NO_TANK is "every catch, newest first". */
import { isPersonalBest, recordOf, measured, fishIn } from "./stats.js";
import { sinceOf } from "./feedfilter.js";

export const NO_TANK = { angler: "", species: "", show: "all", when: "any", derby: "", boat: "", lure: "", released: "any",
  measuredOnly: false, notesOnly: false, q: "", sort: "new" };

export const TANK_SHOW = [["all", "Every catch"], ["records", "Records & PBs"], ["current", "Current catches (no past ones)"], ["past", "Throwbacks (past catches)"]];
export const RELEASED = [["any", "Kept or released"], ["yes", "Released"], ["no", "Kept"]];
export const TANK_SORT = [["new", "Newest"], ["old", "Oldest"], ["heavy", "Heaviest"], ["long", "Longest"], ["reactions", "Most reactions"], ["comments", "Most comments"]];

/* How many filters are in use (the sort counts as one). */
export const tankActive = f => Object.keys(NO_TANK).filter(k => k !== "q" && f[k] !== NO_TANK[k]).length + (f.q.trim() ? 1 : 0);

/* Every emoji anyone has put on a catch. reactions: Map of catch id -> Map of person -> [emoji]. */
export function reactionCount(reactions, id) {
  const r = reactions && reactions.get(id);
  let n = 0;
  if (r) for (const list of r.values()) n += list.length;
  return n;
}

/* The emoji used most on a catch (first used wins a tie), or "" for none. */
export function topReaction(reactions, id) {
  const r = reactions && reactions.get(id), count = new Map();
  if (r) for (const list of r.values()) for (const e of list) count.set(e, (count.get(e) || 0) + 1);
  let best = "", n = 0;
  for (const [e, k] of count) if (k > n) { best = e; n = k; }
  return best;
}

const words = q => q.toLowerCase().split(/\s+/).filter(Boolean);
const matches = (text, ws) => { const t = text.toLowerCase(); return ws.every(w => t.includes(w)); };
const newest = (a, b) => (b.caughtAt || 0) - (a.caughtAt || 0) || (a.id < b.id ? -1 : 1);

/* The catches to show, in order. reactions and comments (Map of catch id -> [comment]) feed the "most" sorts;
   tackle (Map of catch id -> tackle doc) is what this phone can see, so someone's secret tackle never matches a lure. */
export function filterTank({ catches, f, now = Date.now(), reactions = new Map(), comments = new Map(), tackle = new Map() }) {
  const ws = words(f.q), since = sinceOf(f.when, now);
  let list = catches.filter(c =>
    (!f.angler || c.uid === f.angler)
    && (!f.species || c.species === f.species)
    && (!f.derby || c.derbyId === f.derby)
    && (!f.boat || c.boatId === f.boat)
    && (!f.lure || (tackle.get(c.id) || {}).itemId === f.lure)
    && (f.released === "any" || !!c.released === (f.released === "yes"))
    && (!f.measuredOnly || measured(c))
    && (!f.notesOnly || !!(c.notes || "").trim())
    && c.caughtAt >= since
    && (f.show !== "records" || isPersonalBest(c, catches) || recordOf(c, catches))
    && (f.show !== "past" || c.past)
    && (f.show !== "current" || !c.past)
    && (!ws.length || matches(`${c.notes || ""} ${c.locShared ? c.spotName || "" : ""}`, ws)));
  const by = key => (a, b) => key(b) - key(a) || newest(a, b);
  if (f.sort === "old") return list.sort((a, b) => -newest(a, b));
  if (f.sort === "heavy") return list.filter(c => measured(c) && c.weightOz > 0).sort(by(c => c.weightOz));
  if (f.sort === "long") return list.filter(c => measured(c) && c.lengthIn > 0).sort(by(c => c.lengthIn));
  if (f.sort === "reactions") return list.sort(by(c => reactionCount(reactions, c.id)));
  if (f.sort === "comments") return list.sort(by(c => (comments.get(c.id) || []).length));
  return list.sort(newest);
}

/* One line about what's showing: fish (a stringer counts its fish), species, and the heaviest weighed fish. */
export function tankStats(list) {
  const heaviest = list.filter(c => measured(c) && c.weightOz > 0).sort((a, b) => b.weightOz - a.weightOz)[0] || null;
  return { catches: list.length, fish: list.reduce((n, c) => n + fishIn(c), 0), species: new Set(list.map(c => c.species)).size, heaviest };
}
