/* League stats (#/league): the whole league's numbers, from every part of the app. Pure functions on plain data, so
   they can be tested; the page (leaguestatspage.js) passes in the store's maps.
   A period is "season" (this season's league catches), "career" (every league catch) or "alltime" (every catch, the
   📜 logbook's past catches included). Past catches only ever count in "alltime". Disqualified catches never count.
   Fish are counted the usual way: a stringer counts as its number of fish, and is never weighed or measured. */
import { fishIn, isStringer, measured, better, leagueCatches, seasonCatches } from "./stats.js";
import { seasonRange } from "./season.js";
import { DAYPARTS, byMonth } from "./mystats.js";
import { daysOut, dayKey } from "./skunks.js";
import { recordHistory, allReigns, reignLength } from "./halloffame.js";
import { moonPhase, sky, toF, toMph } from "./weather.js";
import { lureKey, cleanLure, techniqueName } from "./tackle.js";
import { closesAt as derbyClosesAt, standings } from "./derby.js";
import { hasMoney, derbyMoney } from "./payout.js";
import { h2hResults } from "./h2h.js";
import { betStatus, betResult, isSides, sideTeams, overUnderSides } from "./bets.js";
import { outingEnd, outingRecap } from "./outings.js";
import { goalsReached } from "./goals.js";

export const PERIODS = [["season", "This season"], ["career", "Career"], ["alltime", "All time"]];
const DAY = 24 * 3600 * 1000;
const sumFish = list => list.reduce((n, c) => n + fishIn(c), 0);
const single = list => list.filter(c => !isStringer(c));
const yearOf = ms => new Date(ms).getFullYear();

/* The times a period covers: a season is its calendar year; career and all time have no limits. */
export const periodRange = (period, year) => (period === "season" ? seasonRange(year) : { from: 0, to: Infinity });
export const inRange = (t, r) => t >= r.from && t <= r.to;

/* The catches a period counts. */
export function periodCatches(catches, period, year) {
  const ok = catches.filter(c => !c.dq);
  if (period === "alltime") return ok;
  return period === "career" ? leagueCatches(ok) : seasonCatches(ok, year);
}

/* Who had the most: [{ key, n }] most first; ties go to whoever got there first (`first`: key -> when), then by key. */
function ranked(counts, first = new Map()) {
  return [...counts].filter(([, n]) => n > 0).map(([key, n]) => ({ key, n }))
    .sort((a, b) => b.n - a.n || (first.get(a.key) ?? 0) - (first.get(b.key) ?? 0) || String(a.key).localeCompare(String(b.key)));
}
/* Fish per angler (or per anything `keyOf` returns), with when each first scored, for ranked(). */
function tally(list, keyOf, amount = fishIn) {
  const n = new Map(), first = new Map();
  for (const c of [...list].sort((a, b) => a.caughtAt - b.caughtAt)) {
    const k = keyOf(c);
    if (k == null || k === "") continue;
    n.set(k, (n.get(k) || 0) + amount(c));
    if (!first.has(k)) first.set(k, c.caughtAt);
  }
  return ranked(n, first);
}

/* Days out for every angler in the period: Map(uid -> daysOut() result). Days with a fish come from the period's
   catches; skunk days (logged, or from outings with no fish) from the same dates. */
export function anglerDays(uids, { catches, skunks = [], trips = new Map(), rsvps = new Map(), range, now = Date.now() }) {
  const out = new Map();
  for (const u of uids) out.set(u, daysOut(u, { catches, skunks, trips, rsvps, from: range.from, to: Math.min(range.to, now), now }));
  return out;
}

/* ---------- A. The headline numbers ---------- */

/* { fish, catches, weightOz, weighed, lengthIn, lengthN, species, released, releasedPct, active, members, daysOut } */
export function headline(pool, { members = [], days = new Map() } = {}) {
  const fish = sumFish(pool), singles = single(pool);
  const weighed = singles.filter(c => c.weightOz > 0), long = singles.filter(c => c.lengthIn > 0);
  const released = sumFish(pool.filter(c => c.released));
  return {
    fish, catches: pool.length,
    weightOz: weighed.reduce((s, c) => s + c.weightOz, 0), weighed: weighed.length,
    lengthIn: long.reduce((s, c) => s + c.lengthIn, 0), lengthN: long.length,
    species: new Set(pool.map(c => c.species)).size,
    released, releasedPct: fish ? Math.round((released / fish) * 100) : 0,
    active: new Set(pool.map(c => c.uid)).size, members: members.length,
    daysOut: [...days.values()].reduce((n, d) => n + d.daysOut, 0),
  };
}

/* ---------- B. Records and big fish ---------- */

/* The biggest fish (heavier wins, then longer), and the top `n` by weight and by length (single fish only). */
export function bigFish(pool, n = 10) {
  const singles = single(pool);
  const top = f => singles.filter(c => c[f] > 0).sort((a, b) => b[f] - a[f] || a.caughtAt - b.caughtAt).slice(0, n);
  return { biggest: pool.filter(measured).reduce((b, c) => (b ? better(c, b) : c), null), heaviest: top("weightOz"), longest: top("lengthIn") };
}

/* The record boards over the period (league catches; a season's boards start again every January 1):
   { set, broken, latest: reign broken last, standing: the longest-standing record still held, closest: the record
   broken by the smallest margin ({ ...reign, margin }) }. A reign: { species, field, c, from, until, brokenBy }. */
export function recordStats(all, period, year, now = Date.now()) {
  const range = periodRange(period, year);
  const reigns = allReigns(recordHistory(period === "season" ? all.filter(c => inRange(c.caughtAt, range)) : all));
  const broken = reigns.filter(r => r.brokenBy && inRange(r.until, range));
  const latest = [...broken].sort((a, b) => b.until - a.until)[0] || null;
  const standing = reigns.filter(r => !r.brokenBy).sort((a, b) => reignLength(b, now) - reignLength(a, now) || a.from - b.from)[0] || null;
  const closest = broken.map(r => ({ ...r, margin: Math.round((r.brokenBy[r.field] - r.c[r.field]) * 100) / 100 }))
    .sort((a, b) => a.margin - b.margin || b.until - a.until)[0] || null;
  return { set: reigns.filter(r => inRange(r.from, range)).length, broken: broken.length, latest, standing, closest };
}

/* The biggest jump on a personal best: a fish that beat the angler's previous best of its species by the most (as a
   share of the old best), by weight or by length. Every catch counts toward the old best (there's one PB), but the
   new one must be in the period's `pool`. { c, prev, field, gain, pct } or null. */
export function biggestPbJump(all, pool) {
  const inPool = new Set(pool.map(c => c.id)), best = new Map();
  let top = null;
  for (const c of all.filter(x => !x.dq && measured(x)).sort((a, b) => a.caughtAt - b.caughtAt)) {
    for (const field of ["weightOz", "lengthIn"]) {
      if (!(c[field] > 0)) continue;
      const k = `${c.uid}|${c.species}|${field}`, prev = best.get(k);
      if (prev && c[field] <= prev[field]) continue;
      best.set(k, c);
      if (!prev || !inPool.has(c.id)) continue;
      const gain = c[field] - prev[field], pct = Math.round((gain / prev[field]) * 100);
      if (!top || pct > top.pct) top = { c, prev, field, gain: Math.round(gain * 100) / 100, pct };
    }
  }
  return top;
}

/* The average size of each species, for species with 2 or more weighed or measured fish, most fish first:
   [{ species, fish, avgWeightOz, weighed, avgLengthIn, measured }] (an average is null below 2 fish). */
export function averageSizes(pool) {
  const by = new Map();
  for (const c of pool) {
    const e = by.get(c.species) || { species: c.species, fish: 0, w: [], l: [] };
    e.fish += fishIn(c);
    if (!isStringer(c) && c.weightOz > 0) e.w.push(c.weightOz);
    if (!isStringer(c) && c.lengthIn > 0) e.l.push(c.lengthIn);
    by.set(c.species, e);
  }
  const avg = (xs, step) => (xs.length >= 2 ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length / step) * step : null);
  return [...by.values()].filter(e => e.w.length >= 2 || e.l.length >= 2)
    .map(e => ({ species: e.species, fish: e.fish, avgWeightOz: avg(e.w, 0.1), weighed: e.w.length, avgLengthIn: avg(e.l, 0.25), measured: e.l.length }))
    .sort((a, b) => b.fish - a.fish || a.species.localeCompare(b.species));
}

/* ---------- C. When the fish bite ---------- */

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const weekdayOf = ms => (new Date(ms).getDay() + 6) % 7; // Monday 0
const partOf = h => DAYPARTS.findIndex(p => (p.from < p.to ? h >= p.from && h < p.to : h >= p.from || h < p.to));

/* Fish by day of the week (Monday first) and time of day (mystats' DAYPARTS): { cells: [7][6], max }. */
export function heatmap(pool) {
  const cells = WEEKDAYS.map(() => DAYPARTS.map(() => 0));
  for (const c of pool) cells[weekdayOf(c.caughtAt)][partOf(new Date(c.caughtAt).getHours())] += fishIn(c);
  return { cells, max: Math.max(0, ...cells.flat()) };
}

/* Fish by month: { current: [12], last: [12] | null }. A season is set against the one before it; career and all
   time add every year together. */
export function monthCompare(all, pool, period, year) {
  return { current: byMonth(pool), last: period === "season" ? byMonth(seasonCatches(all.filter(c => !c.dq), year - 1)) : null };
}

/* The day with the most league fish: { day, at, fish, anglers: [uid] } or null. */
export function bestDay(pool) {
  const by = new Map();
  for (const c of pool) {
    const k = dayKey(c.caughtAt), e = by.get(k) || { day: k, at: c.caughtAt, fish: 0, anglers: new Set() };
    e.fish += fishIn(c); e.anglers.add(c.uid); e.at = Math.min(e.at, c.caughtAt);
    by.set(k, e);
  }
  const top = [...by.values()].sort((a, b) => b.fish - a.fish || a.at - b.at)[0];
  return top ? { ...top, anglers: [...top.anglers] } : null;
}

/* The week (Monday to Sunday) with the most fish: { from (Monday's start), fish } or null. */
export function busiestWeek(pool) {
  const by = new Map();
  for (const c of pool) {
    const d = new Date(c.caughtAt);
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - weekdayOf(c.caughtAt)).getTime();
    by.set(monday, (by.get(monday) || 0) + fishIn(c));
  }
  const top = [...by].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  return top ? { from: top[0], fish: top[1] } : null;
}

/* Weekend (Saturday and Sunday) fish against weekday fish. */
export function weekendSplit(pool) {
  let weekend = 0, weekday = 0;
  for (const c of pool) (weekdayOf(c.caughtAt) >= 5 ? (weekend += fishIn(c)) : (weekday += fishIn(c)));
  return { weekend, weekday };
}

/* Early birds (4 to 7 AM) and night stalkers (9 PM to 4 AM): the fish, and who caught the most of each. */
export function earlyAndLate(pool) {
  const early = pool.filter(c => { const h = new Date(c.caughtAt).getHours(); return h >= 4 && h < 7; });
  const night = pool.filter(c => { const h = new Date(c.caughtAt).getHours(); return h >= 21 || h < 4; });
  const top = list => { const r = tally(list, c => c.uid)[0]; return r ? { uid: r.key, n: r.n } : null; };
  return { total: sumFish(pool), early: sumFish(early), earlyTop: top(early), night: sumFish(night), nightTop: top(night) };
}

/* The first and the latest catch in the period. */
export function firstAndLast(pool) {
  const s = [...pool].sort((a, b) => a.caughtAt - b.caughtAt);
  return { first: s[0] || null, last: s.length ? s[s.length - 1] : null };
}

/* This season's pace: league fish so far against last season's by the same date. */
export function pace(all, now = Date.now()) {
  const y = yearOf(now), d = new Date(now), ok = all.filter(c => !c.dq);
  const sameDayLastYear = new Date(y - 1, d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()).getTime();
  const fish = sumFish(seasonCatches(ok, y).filter(c => c.caughtAt <= now));
  const last = sumFish(seasonCatches(ok, y - 1).filter(c => c.caughtAt <= sameDayLastYear));
  return { year: y, fish, last, diff: fish - last };
}

/* ---------- D. Weather and the moon ---------- */

export const MOON_PHASES = [["🌑", "New moon"], ["🌒", "Waxing crescent"], ["🌓", "First quarter"], ["🌔", "Waxing gibbous"],
  ["🌕", "Full moon"], ["🌖", "Waning gibbous"], ["🌗", "Last quarter"], ["🌘", "Waning crescent"]];
/* Fish by moon phase (worked out from the time caught, so every catch has one): [{ label, emoji, n }]. */
export function byMoon(pool) {
  const out = MOON_PHASES.map(([emoji, label]) => ({ emoji, label, n: 0 }));
  for (const c of pool) out[MOON_PHASES.findIndex(p => p[1] === moonPhase(c.caughtAt).name)].n += fishIn(c);
  return out;
}

const band = (bands, v) => bands.find(b => v < b.below) || bands[bands.length - 1];
export const PRESSURE_BANDS = [
  { label: "Low", range: "under 29.80 inHg", below: 1009.1 },
  { label: "Normal", range: "29.80–30.20 inHg", below: 1022.7 },
  { label: "High", range: "over 30.20 inHg", below: Infinity },
];
export const TEMP_BANDS = [
  { label: "Under 40°F", below: 40 }, { label: "40s", below: 50 }, { label: "50s", below: 60 },
  { label: "60s", below: 70 }, { label: "70s", below: 80 }, { label: "80°F and up", below: Infinity },
];
export const WIND_BANDS = [
  { label: "Calm", range: "under 5 mph", below: 5 }, { label: "Light", range: "5–9 mph", below: 10 },
  { label: "Breezy", range: "10–14 mph", below: 15 }, { label: "Windy", range: "15–19 mph", below: 20 },
  { label: "Blowing", range: "20 mph and up", below: Infinity },
];
/* Fish in each band: [{ label, range, n }]. */
function banded(list, bands, valueOf) {
  const out = bands.map(b => ({ label: b.label, range: b.range, n: 0 }));
  for (const [c, w] of list) { const v = valueOf(w); if (v != null) out[bands.indexOf(band(bands, v))].n += fishIn(c); }
  return out;
}

/* The weather on the period's catches (only catches whose weather has been looked up):
   { covered, pressure, temp, wind, sky: [{ label, emoji, n }], coldest, hottest, windiest: { c, w } }. */
export function weatherStats(pool, weather = new Map()) {
  const list = pool.map(c => [c, weather.get(c.id)]).filter(([, w]) => w && w.tempC != null);
  const skies = new Map();
  for (const [c, w] of list) {
    const s = sky(w.code);
    if (!s) continue;
    const e = skies.get(s.text) || { label: s.text, emoji: s.emoji, n: 0 };
    e.n += fishIn(c);
    skies.set(s.text, e);
  }
  const pick = (f, sign) => {
    const has = list.filter(([, w]) => w[f] != null);
    const top = has.sort((a, b) => sign * (b[1][f] - a[1][f]) || a[0].caughtAt - b[0].caughtAt)[0];
    return top ? { c: top[0], w: top[1] } : null;
  };
  return {
    covered: list.length, catches: pool.length,
    pressure: banded(list, PRESSURE_BANDS, w => w.pressureHpa || null),
    temp: banded(list, TEMP_BANDS, w => toF(w.tempC)),
    wind: banded(list, WIND_BANDS, w => (w.windKph == null ? null : toMph(w.windKph))),
    sky: [...skies.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)),
    coldest: pick("tempC", -1), hottest: pick("tempC", 1), windiest: pick("windKph", 1),
  };
}

/* ---------- E. Tackle (shared tackle only: pass only what everyone may see) ---------- */

/* Lures, grouped however they were typed: [{ key, label, fish, weightOz, anglers }], most fish first. */
export function lureBoard(pool, tackle) {
  const by = new Map();
  for (const c of pool) {
    const t = tackle.get(c.id), k = t && lureKey(t.lure);
    if (!k) continue;
    const e = by.get(k) || { key: k, label: cleanLure(t.lure), fish: 0, weightOz: 0, anglers: new Set() };
    e.fish += fishIn(c);
    if (!isStringer(c) && c.weightOz > 0) e.weightOz += c.weightOz;
    e.anglers.add(c.uid);
    by.set(k, e);
  }
  return [...by.values()].map(e => ({ ...e, anglers: e.anglers.size })).sort((a, b) => b.fish - a.fish || a.label.localeCompare(b.label));
}

/* The lure with the most league fish in the last `days` days (any period), or null. */
export function hotLure(all, tackle, now = Date.now(), days = 30) {
  const recent = leagueCatches(all.filter(c => !c.dq && c.caughtAt > now - days * DAY && c.caughtAt <= now));
  return lureBoard(recent, tackle)[0] || null;
}

/* Lure and species pairings: [{ lure, species, fish }], most first. */
export function pairings(pool, tackle, n = 8) {
  const by = new Map();
  for (const c of pool) {
    const t = tackle.get(c.id), k = t && lureKey(t.lure);
    if (!k) continue;
    const key = `${k}|${c.species}`, e = by.get(key) || { lure: cleanLure(t.lure), species: c.species, fish: 0 };
    e.fish += fishIn(c);
    by.set(key, e);
  }
  return [...by.values()].sort((a, b) => b.fish - a.fish || a.lure.localeCompare(b.lure)).slice(0, n);
}

/* Fish by technique: [{ label, n }], most first. */
export function techniqueMix(pool, tackle) {
  const r = tally(pool, c => { const t = tackle.get(c.id); return t && techniqueName(t.technique) ? t.technique : null; });
  return r.map(({ key, n }) => ({ label: techniqueName(key), n }));
}

export const DEPTH_BANDS = [
  { label: "Under 5 ft", below: 5 }, { label: "5–9 ft", below: 10 }, { label: "10–14 ft", below: 15 }, { label: "15–19 ft", below: 20 },
  { label: "20–29 ft", below: 30 }, { label: "30–49 ft", below: 50 }, { label: "50 ft and up", below: Infinity },
];
/* Fish at each depth (catches with a depth noted): [{ label, n }]. */
export function depthProfile(pool, tackle) {
  return banded(pool.map(c => [c, tackle.get(c.id)]).filter(([, t]) => t && t.depthFt > 0), DEPTH_BANDS, t => t.depthFt);
}

/* The tackle box item that's caught the most fish: { item, fish } or null. */
export function topBoxItem(pool, tackle, box = new Map()) {
  const r = tally(pool, c => { const t = tackle.get(c.id); return t && t.itemId && box.has(t.itemId) ? t.itemId : null; })[0];
  return r ? { item: box.get(r.key), fish: r.n } : null;
}

/* ---------- F. Species ---------- */

/* Every species caught: [{ species, fish, share (%), top: { uid, n } }], most fish first. */
export function speciesTable(pool) {
  const total = sumFish(pool);
  return tally(pool, c => c.species).map(({ key, n }) => {
    const top = tally(pool.filter(c => c.species === key), c => c.uid)[0];
    return { species: key, fish: n, share: total ? Math.round((n / total) * 100) : 0, top: top ? { uid: top.key, n: top.n } : null };
  });
}

/* The rarest catches: the species with the fewest fish, each with its first catch: [{ species, fish, c }]. */
export function rarest(pool, n = 3) {
  const t = speciesTable(pool);
  if (!t.length) return [];
  const min = t[t.length - 1].fish;
  return t.filter(r => r.fish === min).slice(-n).map(r => ({ species: r.species, fish: r.fish,
    c: pool.filter(c => c.species === r.species).sort((a, b) => a.caughtAt - b.caughtAt)[0] }));
}

/* Species debuts: the first catch of each species, newest first. In a season, the species first caught in it (league
   catches); otherwise every species' first catch (league catches for career, every catch for all time). */
export function debuts(all, period, year) {
  const ok = all.filter(c => !c.dq), pool = period === "alltime" ? ok : leagueCatches(ok), first = new Map();
  for (const c of [...pool].sort((a, b) => a.caughtAt - b.caughtAt)) if (!first.has(c.species)) first.set(c.species, c);
  return [...first.values()].filter(c => period !== "season" || yearOf(c.caughtAt) === year).sort((a, b) => b.caughtAt - a.caughtAt);
}

/* Different species per angler: [{ uid, n }], most first. */
export function diversity(pool) {
  const sets = new Map(), first = new Map();
  for (const c of [...pool].sort((a, b) => a.caughtAt - b.caughtAt)) {
    if (!sets.has(c.uid)) sets.set(c.uid, new Set());
    const s = sets.get(c.uid), had = s.size;
    s.add(c.species);
    if (s.size > had) first.set(c.uid, c.caughtAt); // when they reached their total
  }
  return ranked(new Map([...sets].map(([u, s]) => [u, s.size])), first).map(({ key, n }) => ({ uid: key, n }));
}

/* ---------- G. Places and boats ---------- */

export const SAME_SPOT_M = 250;
function metres(a, b) {
  const R = 6371000, rad = x => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* The league's shared spots, with spots within 250 m counted as one (like the Explorer crown): [{ lat, lng, name,
   fish, catches, anglers }], most fish first. Only shared spots count. */
export function spotBoard(pool, spots = new Map()) {
  const groups = [];
  for (const c of [...pool].sort((a, b) => a.caughtAt - b.caughtAt)) {
    const s = spots.get(c.id);
    if (!s || !s.shared || typeof s.lat !== "number") continue;
    let g = groups.find(x => metres(x, s) <= SAME_SPOT_M);
    if (!g) groups.push(g = { lat: s.lat, lng: s.lng, names: new Map(), fish: 0, catches: 0, anglers: new Set(), firstId: c.id });
    g.fish += fishIn(c); g.catches++; g.anglers.add(c.uid);
    const name = (s.name || c.spotName || "").trim();
    if (name) g.names.set(name, (g.names.get(name) || 0) + 1);
  }
  return groups.map(g => ({ lat: g.lat, lng: g.lng, fish: g.fish, catches: g.catches, anglers: g.anglers.size, firstId: g.firstId,
    name: [...g.names].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "" }))
    .sort((a, b) => b.fish - a.fish || b.anglers - a.anglers);
}

/* Saved boats: [{ boat, fish, biggest, crew: number of anglers who caught aboard }], most fish first. */
export function boatBoard(pool, fleet = new Map()) {
  const by = new Map();
  for (const c of pool) {
    if (!c.boatId || !fleet.has(c.boatId)) continue;
    const e = by.get(c.boatId) || { boat: fleet.get(c.boatId), fish: 0, biggest: null, crew: new Set() };
    e.fish += fishIn(c); e.crew.add(c.uid);
    if (measured(c)) e.biggest = e.biggest ? better(c, e.biggest) : c;
    by.set(c.boatId, e);
  }
  return [...by.values()].map(e => ({ ...e, crew: e.crew.size })).sort((a, b) => b.fish - a.fish || (a.boat.name || "").localeCompare(b.boat.name || ""));
}

/* Fish logged on a saved boat against the rest (shore, or no boat picked). */
export function boatOrShore(pool) {
  const boat = sumFish(pool.filter(c => c.boatId));
  return { boat, other: sumFish(pool) - boat };
}

/* ---------- H. Derbies, head-to-heads, bets and crowns ---------- */

/* Finished derbies in the period (not cancelled or testing): { count, entries, pot, biggest: { uid, amount, d },
   wins: [{ uid, n }], podiums: [{ uid, n }] }. Money counts derbies with an entry fee or added money. */
export function derbyStats({ derbies = new Map(), entrants = new Map(), catches = [], mystery = new Map(), range, now = Date.now() }) {
  const done = [...derbies.values()].filter(d => !d.cancelled && !d.testing && derbyClosesAt(d) <= now && inRange(d.end, range));
  const wins = new Map(), podiums = new Map(), firstAt = new Map();
  let entries = 0, pot = 0, biggest = null;
  for (const d of done.sort((a, b) => a.end - b.end)) {
    const ent = entrants.get(d.id) || new Map();
    entries += ent.size;
    const rows = standings(d, catches, ent).filter(r => r.score > 0);
    rows.slice(0, 3).forEach((r, i) => {
      podiums.set(r.uid, (podiums.get(r.uid) || 0) + 1);
      if (!i) wins.set(r.uid, (wins.get(r.uid) || 0) + 1);
      if (!firstAt.has(r.uid)) firstAt.set(r.uid, d.end);
    });
    if (!hasMoney(d)) continue;
    const m = derbyMoney(d, catches, ent, { mysteryOz: (mystery.get(d.id) || {}).weightOz ?? null });
    pot += m.total || 0;
    for (const p of m.payees) if (p.payee && p.payee.uid && (!biggest || p.amount > biggest.amount)) biggest = { uid: p.payee.uid, amount: p.amount, d };
  }
  const list = m => ranked(m, firstAt).map(({ key, n }) => ({ uid: key, n }));
  return { count: done.length, entries, pot: Math.round(pot * 100) / 100, biggest, wins: list(wins), podiums: list(podiums) };
}

/* Finished head-to-heads in the period: { count, ties, streak: { uid, n } (most wins in a row), stake: the biggest
   points stake won ({ uid, n, ch }), rivalry: the pair with the most duels ({ a, b, n, aWins, bWins, ties }) }. */
export function h2hStats({ challenges = new Map(), catches = [], range, now = Date.now() }) {
  const all = h2hResults([...challenges.values()], catches, now);
  const results = all.filter(r => inRange(r.at, range));
  const run = new Map(), best = new Map(), pairs = new Map();
  let stake = null;
  for (const r of results) {
    for (const u of [r.ch.from, r.ch.to]) {
      const n = !r.tie && r.winner === u ? (run.get(u) || 0) + 1 : 0;
      run.set(u, n);
      if (n > (best.get(u) || 0)) best.set(u, n);
    }
    const s = r.ch.terms.stake || 0;
    if (!r.tie && s > 0 && (!stake || s > stake.n)) stake = { uid: r.winner, n: s, ch: r.ch };
    const [a, b] = [r.ch.from, r.ch.to].sort(), key = `${a}|${b}`;
    const p = pairs.get(key) || { a, b, n: 0, aWins: 0, bWins: 0, ties: 0, last: 0 };
    p.n++; p.last = r.at;
    if (r.tie) p.ties++; else if (r.winner === a) p.aWins++; else p.bWins++;
    pairs.set(key, p);
  }
  const streak = ranked(best)[0];
  const rivalry = [...pairs.values()].sort((x, y) => y.n - x.n || y.last - x.last)[0] || null;
  return { count: results.length, ties: results.filter(r => r.tie).length, streak: streak ? { uid: streak.key, n: streak.n } : null, stake, rivalry };
}

const sideLabel = (b, i) => (b.sides && b.sides[i]) || (b.rule && b.rule.measure ? overUnderSides(b.rule)[i] : `Side ${i + 1}`);

/* Settled bets in the period: { count, washes, pot, players, mostBacked: { b, label, n } (the side the most anglers took),
   upset: { b, label, n, of } (a winning side that the fewest of the bet's players backed) }. */
export function betStats({ bets = new Map(), betPlayers = new Map(), catches = [], range, now = Date.now() }) {
  let count = 0, washes = 0, pot = 0, players = 0, mostBacked = null, upset = null;
  for (const b of bets.values()) {
    const ps = betPlayers.get(b.id) || new Map();
    if (!inRange(b.end, range) || betStatus(b, catches, ps, now) !== "done") continue;
    const res = betResult(b, catches, ps);
    count++; players += res.rows.length;
    if (res.wash) { washes++; continue; }
    pot += res.pot || 0;
    if (!isSides(b)) continue;
    const teams = sideTeams(b, ps), of = teams.reduce((n, t) => n + t.length, 0);
    teams.forEach((t, i) => { if (!mostBacked || t.length > mostBacked.n) mostBacked = { b, label: sideLabel(b, i), n: t.length }; });
    const won = teams[res.side] || [];
    if (won.length && won.length < of - won.length && (!upset || won.length / of < upset.n / upset.of)) upset = { b, label: sideLabel(b, res.side), n: won.length, of };
  }
  return { count, washes, pot: Math.round(pot * 100) / 100, players, mostBacked, upset };
}

/* Crowns changing hands (steals, not first claims) in the period: { steals, contested: { crown, n } (the crown stolen
   most), latest: { crown, uid, from, at } }. seasons: crownSeasons()'s Map(year -> crowns). */
export function crownStats(seasons = new Map(), period, year) {
  const list = period === "season" ? seasons.get(year) || [] : [...seasons.values()].flat();
  const steals = list.flatMap(s => s.history.filter(h => h.from && h.uid && !h.ended).map(h => ({ ...h, crown: s.crown })));
  const by = new Map();
  for (const s of steals) { const e = by.get(s.crown.id) || { crown: s.crown, n: 0 }; e.n++; by.set(s.crown.id, e); }
  return {
    steals: steals.length,
    contested: [...by.values()].sort((a, b) => b.n - a.n || a.crown.name.localeCompare(b.crown.name))[0] || null,
    latest: steals.sort((a, b) => b.at - a.at)[0] || null,
  };
}

/* ---------- I. Social and community ---------- */

/* Reactions on the period's catches: { total, byEmoji: [{ emoji, n }], top: { c, n, byEmoji }, givers: [{ uid, n }]
   (reactions given on other people's catches) }. reactions: Map(catch id -> Map(uid -> [emoji])). */
export function reactionStats(pool, reactions = new Map()) {
  const emojis = new Map(), givers = new Map();
  let total = 0, top = null;
  for (const c of pool) {
    const r = reactions.get(c.id);
    if (!r) continue;
    let n = 0;
    const mine = new Map();
    for (const [u, list] of r) {
      n += list.length;
      if (u !== c.uid) givers.set(u, (givers.get(u) || 0) + list.length);
      for (const e of list) { emojis.set(e, (emojis.get(e) || 0) + 1); mine.set(e, (mine.get(e) || 0) + 1); }
    }
    total += n;
    if (n && (!top || n > top.n || (n === top.n && c.caughtAt < top.c.caughtAt))) top = { c, n, byEmoji: ranked(mine).map(({ key, n: k }) => ({ emoji: key, n: k })) };
  }
  return { total, byEmoji: ranked(emojis).map(({ key, n }) => ({ emoji: key, n })), top, givers: ranked(givers).map(({ key, n }) => ({ uid: key, n })) };
}

/* Comments on the period's catches: { total, top: { c, n }, commenters: [{ uid, n }] }. comments: Map(catch id -> [comment]). */
export function commentStats(pool, comments = new Map()) {
  const by = new Map();
  let total = 0, top = null;
  for (const c of pool) {
    const list = comments.get(c.id) || [];
    total += list.length;
    for (const m of list) by.set(m.uid, (by.get(m.uid) || 0) + 1);
    if (list.length && (!top || list.length > top.n || (list.length === top.n && c.caughtAt < top.c.caughtAt))) top = { c, n: list.length };
  }
  return { total, top, commenters: ranked(by).map(({ key, n }) => ({ uid: key, n })) };
}

/* Outings that are over, in the period: { count, said (In answers), showed (In and not a no-show), rate (%), fish
   (caught on them by anglers who showed), biggest: { t, n } (the biggest turnout), reliable: { uid, n } (most shows) }.
   rsvps: everyone's answers (before no-shows are taken out); noShows: Map(trip id -> Map(uid -> mark)). */
export function outingStats({ trips = new Map(), rsvps = new Map(), noShows = new Map(), catches = [], range, now = Date.now() }) {
  const over = [...trips.values()].filter(t => outingEnd(t) < now && inRange(t.at, range)).sort((a, b) => a.at - b.at);
  const shows = new Map(), firstAt = new Map();
  let said = 0, showed = 0, fish = 0, biggest = null;
  for (const t of over) {
    const gone = noShows.get(t.id) || new Map();
    const ins = [...(rsvps.get(t.id) || new Map())].filter(([, r]) => r.answer === "in");
    const there = new Map(ins.filter(([u]) => !gone.has(u)));
    said += ins.length; showed += there.size;
    for (const u of there.keys()) { shows.set(u, (shows.get(u) || 0) + 1); if (!firstAt.has(u)) firstAt.set(u, t.at); }
    fish += outingRecap(t, catches.filter(c => !c.dq), there, now).fish;
    if (there.size && (!biggest || there.size > biggest.n)) biggest = { t, n: there.size };
  }
  const reliable = ranked(shows, firstAt)[0];
  return { count: over.length, said, showed, rate: said ? Math.round((showed / said) * 100) : 0, fish, biggest,
    reliable: reliable ? { uid: reliable.key, n: reliable.n } : null };
}

/* Skunks across the league, from anglerDays(): { daysOut, skunkDays, rate (%), drought: { uid, n, day, fish } (the most
   skunk days out in a row that ended with a fish) }. */
export function skunkStats(days = new Map()) {
  let daysOut = 0, skunkDays = 0, drought = null;
  for (const [u, d] of days) {
    daysOut += d.daysOut; skunkDays += d.skunkDays;
    let run = 0;
    for (const x of d.days) {
      if (x.skunk) { run++; continue; }
      if (run && (!drought || run > drought.n)) drought = { uid: u, n: run, day: x.day, fish: x.fish };
      run = 0;
    }
  }
  return { daysOut, skunkDays, rate: daysOut ? Math.round((skunkDays / daysOut) * 100) : 0, drought };
}

/* ---------- J. Badges, goals and league milestones ---------- */

/* Badges earned in the period: { count, top: { uid, n }, rarest: { badge, owners: [uid] } (the badge held by the
   fewest anglers) }. badges: badgeTimeline() entries ({ uid, badge, at, season? }). */
export function badgeStats(badges = [], period, year) {
  const range = periodRange(period, year);
  const list = badges.filter(b => (period === "season" ? (b.season != null ? b.season === year : inRange(b.at, range)) : true));
  const owners = new Map(), per = new Map(), firstAt = new Map();
  for (const b of list) {
    if (!owners.has(b.badge.id)) owners.set(b.badge.id, { badge: b.badge, owners: new Set() });
    owners.get(b.badge.id).owners.add(b.uid);
    per.set(b.uid, (per.get(b.uid) || 0) + 1);
    if (!firstAt.has(b.uid)) firstAt.set(b.uid, b.at);
  }
  const rare = [...owners.values()].sort((a, b) => a.owners.size - b.owners.size || a.badge.name.localeCompare(b.badge.name))[0];
  const top = ranked(per, firstAt)[0];
  return { count: list.length, top: top ? { uid: top.key, n: top.n } : null, rarest: rare ? { badge: rare.badge, owners: [...rare.owners] } : null };
}

/* Goals reached in the period, and how many anglers reached one. data: what goalProgress() needs. */
export function goalStats(goals = [], data, range) {
  const reached = goalsReached(goals, data).filter(r => inRange(r.at, range));
  return { reached: reached.length, anglers: new Set(reached.map(r => r.g.uid)).size, set: goals.filter(g => inRange(g.createdAt || 0, range)).length };
}

export const MILESTONES = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
/* The league's next milestone in league fish ever: { fish, next, prev, pct } (next is null past the last one). */
export function milestone(fish) {
  const next = MILESTONES.find(m => m > fish) ?? null;
  const prev = [...MILESTONES].reverse().find(m => m <= fish) ?? 0;
  return { fish, next, prev, pct: next ? Math.floor((fish / next) * 100) : 100 };
}

/* ---------- Superlatives ---------- */

export const LUNKER_OZ = 80; // 5 lb
/* Fun titles from the period: [{ id, icon, title, desc, uid, n }] (only the ones somebody qualifies for).
   n is the number behind it: days, fish per day, ounces, a percentage or a count. */
export function superlatives(pool, { days = new Map(), tackle = new Map() } = {}) {
  const by = new Map();
  for (const c of pool) { if (!by.has(c.uid)) by.set(c.uid, []); by.get(c.uid).push(c); }
  const best = (score, min = () => true) => {
    let top = null;
    for (const [u, list] of by) {
      if (!min(u, list)) continue;
      const n = score(u, list);
      if (n > 0 && (!top || n > top.n || (n === top.n && u < top.uid))) top = { uid: u, n };
    }
    return top;
  };
  const d = u => days.get(u) || { daysOut: 0 };
  const weighed = list => single(list).filter(c => c.weightOz > 0);
  const out = [];
  const add = (id, icon, title, desc, top) => { if (top) out.push({ id, icon, title, desc, ...top }); };
  add("grinder", "📅", "The Grinder", "Most days out", best(u => d(u).daysOut));
  add("sniper", "🎯", "Sniper", "Most fish per day out (3+ days out)",
    best((u, list) => Math.round((sumFish(list) / d(u).daysOut) * 10) / 10, u => d(u).daysOut >= 3));
  add("heavyweight", "🏋️", "Heavyweight", "Heaviest average fish (3+ weighed)",
    best((u, list) => Math.round(weighed(list).reduce((s, c) => s + c.weightOz, 0) / weighed(list).length * 10) / 10, (u, list) => weighed(list).length >= 3));
  add("saint", "😇", "Catch & Release Saint", "Most fish released, by share (5+ fish)",
    best((u, list) => Math.round((sumFish(list.filter(c => c.released)) / sumFish(list)) * 100), (u, list) => sumFish(list) >= 5));
  add("magnet", "🧲", "Lunker Magnet", "Most fish of 5 lb or more", best((u, list) => weighed(list).filter(c => c.weightOz >= LUNKER_OZ).length));
  add("tinkerer", "🧪", "Tackle Tinkerer", "Most different lures that caught fish (shared tackle)",
    best((u, list) => new Set(list.map(c => tackle.get(c.id)).filter(t => t && lureKey(t.lure)).map(t => lureKey(t.lure))).size));
  return out;
}
