/* End-of-season awards: a season is a calendar year. Worked out from the data every time (nothing is stored), like the
   rankings. The current season is "so far". Pure functions on plain data.
   `input` is the ranking input (catches, derbies, entrants, versions, members, crowns, badges, …) plus fleet, tackle,
   skunks, trips, rsvps and now. */
import { rankings, rankEvents } from "./rank.js";
import { fishIn, measured, better } from "./stats.js";
import { daysOut } from "./skunks.js";
import { recordHistory, allReigns } from "./halloffame.js";
import { lureKey, cleanLure } from "./tackle.js";

export const seasonRange = year => ({ from: new Date(year, 0, 1).getTime(), to: new Date(year, 11, 31, 23, 59, 59, 999).getTime() });

/* The seasons there is something to show for, newest first: from the year of the first league catch to this year. */
export function seasonYears(catches, now = Date.now()) {
  const thisYear = new Date(now).getFullYear();
  const first = catches.filter(c => !c.past).reduce((m, c) => Math.min(m, c.caughtAt), Infinity);
  const start = isFinite(first) ? Math.min(new Date(first).getFullYear(), thisYear) : thisYear;
  const out = [];
  for (let y = thisYear; y >= start; y--) out.push(y);
  return out;
}

/* Season points: the current season matches the Leaders' "This season" (records and crowns held now count); a finished
   season counts what was earned during it (record and crown points only count while held, so they're left out). */
export function seasonPoints(year, input, now = Date.now()) {
  const { from, to } = seasonRange(year);
  if (now <= to) return rankings({ ...input, now }, { since: from }).filter(r => r.points > 0);
  const by = new Map();
  for (const e of rankEvents({ ...input, now })) {
    if (e.standing || e.at < from || e.at > to) continue;
    by.set(e.uid, Math.round(((by.get(e.uid) || 0) + e.pts) * 10) / 10);
  }
  return [...by].map(([uid, points]) => ({ uid, points })).filter(r => r.points > 0)
    .sort((a, b) => b.points - a.points || a.uid.localeCompare(b.uid));
}

/* Who had the most of something: { uid, n } (ties go to whoever got there first, then by id), or null. */
function most(counts, firstAt = new Map()) {
  let best = null;
  for (const [uid, n] of counts) {
    if (!(n > 0)) continue;
    const fa = firstAt.get(uid) ?? 0, fb = best ? firstAt.get(best.uid) ?? 0 : 0;
    if (!best || n > best.n || (n === best.n && (fa < fb || (fa === fb && uid < best.uid)))) best = { uid, n };
  }
  return best;
}

/* The awards for a season: { year, from, to, ongoing, podium: [{ uid, points }] (top 3), awards: [{ id, icon, title,
   uid?, boatId?, text, n?, c? }], records: [reign], crowns: [{ crown, uid }] }. */
export function seasonAwards(year, input, now = Date.now()) {
  const { from, to } = seasonRange(year);
  const ongoing = now <= to;
  const catches = input.catches.filter(c => !c.dq && !c.past && c.caughtAt >= from && c.caughtAt <= to)
    .sort((a, b) => a.caughtAt - b.caughtAt);
  const awards = [];
  const tally = f => { const m = new Map(), first = new Map(); for (const c of catches) { const n = f(c); if (!n) continue; m.set(c.uid, (m.get(c.uid) || 0) + n); if (!first.has(c.uid)) first.set(c.uid, c.caughtAt); } return most(m, first); };

  const biggest = catches.filter(measured).reduce((b, c) => (b ? better(c, b) : c), null);
  if (biggest) awards.push({ id: "biggest", icon: "🐋", title: "Biggest fish", uid: biggest.uid, c: biggest });
  const fish = tally(fishIn);
  if (fish) awards.push({ id: "fish", icon: "🎣", title: "Most fish", uid: fish.uid, n: fish.n, text: `${fish.n} fish` });
  const species = new Map();
  for (const c of catches) { if (!species.has(c.uid)) species.set(c.uid, new Set()); species.get(c.uid).add(c.species); }
  const sp = most(new Map([...species].map(([u, s]) => [u, s.size])));
  if (sp) awards.push({ id: "species", icon: "🌈", title: "Most species", uid: sp.uid, n: sp.n, text: `${sp.n} species` });

  const members = input.members || [...new Set(catches.map(c => c.uid))];
  const outs = new Map(members.map(u => [u, daysOut(u, { catches: input.catches.filter(c => !c.dq), skunks: input.skunks || [], trips: input.trips, rsvps: input.rsvps, from, to: Math.min(to, now), now })]));
  const days = most(new Map([...outs].map(([u, d]) => [u, d.daysOut])));
  if (days) awards.push({ id: "days", icon: "📅", title: "Most days out", uid: days.uid, n: days.n, text: `${days.n} days` });
  const skunks = most(new Map([...outs].map(([u, d]) => [u, d.skunkDays])));
  if (skunks) awards.push({ id: "skunks", icon: "🦨", title: "Most skunks", uid: skunks.uid, n: skunks.n, text: `${skunks.n} skunked days` });

  const records = allReigns(recordHistory(input.catches)).filter(r => r.from >= from && r.from <= to).sort((a, b) => a.from - b.from);
  const breaker = most(records.reduce((m, r) => m.set(r.c.uid, (m.get(r.c.uid) || 0) + 1), new Map()));
  if (breaker) awards.push({ id: "records", icon: "👑", title: "Record breaker", uid: breaker.uid, n: breaker.n, text: `${breaker.n} record${breaker.n === 1 ? "" : "s"} set` });
  const badges = (input.badges || []).filter(b => b.at >= from && b.at <= to);
  const badger = most(badges.reduce((m, b) => m.set(b.uid, (m.get(b.uid) || 0) + 1), new Map()));
  if (badger) awards.push({ id: "badges", icon: "🏅", title: "Most badges", uid: badger.uid, n: badger.n, text: `${badger.n} badges` });

  // Top boat (saved boats) and top lure (shared tackle only, grouped however it was typed).
  const fleet = input.fleet || new Map();
  const boat = most(catches.filter(c => c.boatId && fleet.has(c.boatId)).reduce((m, c) => m.set(c.boatId, (m.get(c.boatId) || 0) + fishIn(c)), new Map()));
  if (boat) awards.push({ id: "boat", icon: "🚤", title: "Top boat", boatId: boat.uid, uid: fleet.get(boat.uid).uid, n: boat.n, text: `${fleet.get(boat.uid).name}: ${boat.n} fish` });
  const lures = new Map(), names = new Map();
  for (const c of catches) {
    const t = input.tackle && input.tackle.get(c.id), k = t && t.shared && lureKey(t.lure);
    if (!k) continue;
    lures.set(k, (lures.get(k) || 0) + fishIn(c));
    if (!names.has(k)) names.set(k, cleanLure(t.lure));
  }
  const lure = most(lures);
  if (lure) awards.push({ id: "lure", icon: "🪝", title: "Top lure", n: lure.n, text: `${names.get(lure.uid)}: ${lure.n} fish` });

  // Crowns held at the end of the season (now, for the current one).
  const end = Math.min(to, now);
  const crowns = (input.crowns || []).map(s => {
    const h = (s.history || []).filter(x => x.at <= end).pop();
    return { crown: s.crown, uid: h ? h.uid : null };
  }).filter(x => x.uid);

  return { year, from, to, ongoing, podium: seasonPoints(year, input, now).slice(0, 3), awards, records, crowns };
}
