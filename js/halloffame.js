/* The Hall of Fame: every league record ever held, from the first one set. Worked out from the catches (nothing is
   stored), the same way as record news: league catches only (not past catches), measured, not disqualified, in the
   order they were caught. Pure functions on plain objects. */
import { measured } from "./stats.js";

export const FIELDS = [["weightOz", "Weight"], ["lengthIn", "Length"]];

/* Each species' record history: Map(species -> { weightOz: [reign], lengthIn: [reign] }), species with the most
   reigns first. A reign: { c, from, until, brokenBy } — `until` and `brokenBy` are null for the record that stands. */
export function recordHistory(catches) {
  const list = catches.filter(c => !c.dq && !c.past && measured(c)).sort((a, b) => a.caughtAt - b.caughtAt || (a.id < b.id ? -1 : 1));
  const by = new Map();
  for (const [field] of FIELDS) {
    const holder = new Map(); // species -> current reign
    for (const c of list) {
      if (!(c[field] > 0)) continue;
      const cur = holder.get(c.species);
      if (cur && c[field] <= cur.c[field]) continue;
      if (!by.has(c.species)) by.set(c.species, { weightOz: [], lengthIn: [] });
      if (cur) { cur.until = c.caughtAt; cur.brokenBy = c; }
      const reign = { c, from: c.caughtAt, until: null, brokenBy: null };
      by.get(c.species)[field].push(reign);
      holder.set(c.species, reign);
    }
  }
  const count = h => h.weightOz.length + h.lengthIn.length;
  return new Map([...by].sort((a, b) => count(b[1]) - count(a[1]) || a[0].localeCompare(b[0])));
}

/* How long a reign lasted (or has lasted so far), in ms. */
export const reignLength = (r, now = Date.now()) => Math.max(0, (r.until ?? now) - r.from);

/* Every reign as one list: [{ species, field, ...reign }]. */
export function allReigns(history) {
  const out = [];
  for (const [species, h] of history) for (const [field] of FIELDS) for (const r of h[field]) out.push({ species, field, ...r });
  return out;
}

/* The longest reigns (standing records count up to now): top `n`. */
export function longestReigns(history, n = 5, now = Date.now()) {
  return allReigns(history).sort((a, b) => reignLength(b, now) - reignLength(a, now)).slice(0, n);
}

/* Who has set the most records, and how many they hold now: [{ uid, set, held }], most set first. */
export function recordSetters(history) {
  const m = new Map();
  for (const r of allReigns(history)) {
    const e = m.get(r.c.uid) || { uid: r.c.uid, set: 0, held: 0 };
    e.set += 1;
    if (!r.brokenBy) e.held += 1;
    m.set(r.c.uid, e);
  }
  return [...m.values()].sort((a, b) => b.set - a.set || b.held - a.held || a.uid.localeCompare(b.uid));
}
