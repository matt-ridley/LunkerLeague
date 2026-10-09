/* An angler's stats page: catches by month, time of day, species and lure, and what's working (the lures, techniques
   and depths that caught each species). Pure functions on plain objects, counted in fish (a stringer counts as its
   number of fish). Past catches (the logbook) count here: it's your fishing, not points.
   Tackle comes as a Map of catch id -> { lure, depthFt, technique, shared }, holding only what this phone may see. */
import { fishIn } from "./stats.js";
import { lureKey, cleanLure, techniqueName } from "./tackle.js";

export const PERIODS = [["all", "All time"], ["year", "This season"], ["last", "Last season"], ["12m", "Last 12 months"]];

/* A period as { from, to } in ms, as of `now`. All time has no limits. */
export function periodRange(period, now = Date.now()) {
  const d = new Date(now);
  if (period === "year") return { from: new Date(d.getFullYear(), 0, 1).getTime(), to: now };
  if (period === "last") return { from: new Date(d.getFullYear() - 1, 0, 1).getTime(), to: new Date(d.getFullYear(), 0, 1).getTime() - 1 };
  if (period === "12m") return { from: new Date(d.getFullYear() - 1, d.getMonth(), d.getDate()).getTime(), to: now };
  return { from: 0, to: Infinity };
}

/* The catches in a period, as of `now`. */
export function inPeriod(catches, period, now = Date.now()) {
  const { from, to } = periodRange(period, now);
  return catches.filter(c => c.caughtAt >= from && c.caughtAt <= to);
}

const dayKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

/* Fish, catches (photos logged), species and days with a fish. */
export function summary(catches) {
  return {
    fish: catches.reduce((n, c) => n + fishIn(c), 0),
    catches: catches.length,
    species: new Set(catches.map(c => c.species)).size,
    days: new Set(catches.map(c => dayKey(c.caughtAt))).size,
  };
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/* Fish in each month of the year (January first), every year added together. */
export function byMonth(catches) {
  const out = new Array(12).fill(0);
  for (const c of catches) out[new Date(c.caughtAt).getMonth()] += fishIn(c);
  return out;
}

/* Times of day, by the hour each starts at (local time). Night runs over midnight. */
export const DAYPARTS = [
  { label: "Early", range: "4–7 AM", from: 4, to: 7 },
  { label: "Morning", range: "7–11 AM", from: 7, to: 11 },
  { label: "Midday", range: "11 AM–2 PM", from: 11, to: 14 },
  { label: "Afternoon", range: "2–5 PM", from: 14, to: 17 },
  { label: "Evening", range: "5–9 PM", from: 17, to: 21 },
  { label: "Night", range: "9 PM–4 AM", from: 21, to: 4 },
];
const inPart = (h, p) => (p.from < p.to ? h >= p.from && h < p.to : h >= p.from || h < p.to);
export function byDaypart(catches) {
  const out = DAYPARTS.map(p => ({ label: p.label, range: p.range, n: 0 }));
  for (const c of catches) {
    const h = new Date(c.caughtAt).getHours();
    out[DAYPARTS.findIndex(p => inPart(h, p))].n += fishIn(c);
  }
  return out;
}

/* [{ label, n }] most first, then by name. */
const ranked = m => [...m.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));

export function bySpecies(catches) {
  const m = new Map();
  for (const c of catches) {
    const e = m.get(c.species) || { label: c.species, n: 0 };
    e.n += fishIn(c);
    m.set(c.species, e);
  }
  return ranked(m);
}

/* Lures (grouped however they were typed), techniques and depths, from the tackle this phone can see. */
function countLures(catches, tackle) {
  const m = new Map();
  for (const c of catches) {
    const t = tackle.get(c.id), k = t && lureKey(t.lure);
    if (!k) continue;
    const e = m.get(k) || { label: cleanLure(t.lure), n: 0 };
    e.n += fishIn(c);
    m.set(k, e);
  }
  return ranked(m);
}
export const byLure = (catches, tackle) => countLures(catches, tackle);

function countTechniques(catches, tackle) {
  const m = new Map();
  for (const c of catches) {
    const t = tackle.get(c.id);
    if (!t || !techniqueName(t.technique)) continue;
    const e = m.get(t.technique) || { label: techniqueName(t.technique), n: 0 };
    e.n += fishIn(c);
    m.set(t.technique, e);
  }
  return ranked(m);
}
export const byTechnique = (catches, tackle) => countTechniques(catches, tackle);

/* The middle depth of the fish caught at a known depth (each catch once), or null. */
export function usualDepth(catches, tackle) {
  const ds = catches.map(c => tackle.get(c.id)).filter(t => t && t.depthFt > 0).map(t => t.depthFt).sort((a, b) => a - b);
  if (!ds.length) return null;
  const mid = Math.floor(ds.length / 2);
  return ds.length % 2 ? ds[mid] : Math.round((ds[mid - 1] + ds[mid]) / 2 * 10) / 10;
}

/* What's working, by species: for each species with at least `minFish` fish caught with some tackle noted, the lures
   (top 3) and techniques (top 2) that caught the most, and the usual depth. Most fish first.
   For the league, pass everyone's catches and only shared tackle. */
export function whatsWorking(catches, tackle, { minFish = 2 } = {}) {
  const bySp = new Map();
  for (const c of catches) {
    const t = tackle.get(c.id);
    if (!t || !(lureKey(t.lure) || techniqueName(t.technique) || t.depthFt > 0)) continue;
    if (!bySp.has(c.species)) bySp.set(c.species, []);
    bySp.get(c.species).push(c);
  }
  const out = [];
  for (const [species, list] of bySp) {
    const fish = list.reduce((n, c) => n + fishIn(c), 0);
    if (fish < minFish) continue;
    out.push({
      species, fish,
      lures: countLures(list, tackle).slice(0, 3),
      techniques: countTechniques(list, tackle).slice(0, 2),
      depth: usualDepth(list, tackle),
    });
  }
  return out.sort((a, b) => b.fish - a.fish || a.species.localeCompare(b.species));
}
