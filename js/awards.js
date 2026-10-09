/* End-of-season awards: a season is a calendar year (season.js). Worked out from the data every time (nothing is stored), like the
   rankings. The current season is "so far". Pure functions on plain data.
   `input` is the ranking input (catches, derbies, entrants, versions, members, crownHistory, badges, …) plus fleet, tackle,
   skunks, trips, rsvps and now. */
import { seasonRange, seasonTables, finalTable } from "./season.js";
import { speciesRecords } from "./stats.js";
import { fishIn, measured, better } from "./stats.js";
import { daysOut } from "./skunks.js";
import { recordHistory, allReigns } from "./halloffame.js";
import { lureKey, cleanLure } from "./tackle.js";

export { seasonRange, seasonYears } from "./season.js";

/* Season points, as on the Leaders: the current season live, a finished one as it ended (or as saved once locked). */
export function seasonPoints(year, input, now = Date.now()) {
  return (seasonTables(input, now).years.get(year) || []).filter(r => r.points > 0).map(r => ({ uid: r.uid, points: r.points }));
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

  // Season records set: the record history of this season's catches alone (the boards start again every year).
  const records = allReigns(recordHistory(input.catches.filter(c => c.caughtAt >= from && c.caughtAt <= to))).sort((a, b) => a.from - b.from);
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

  // Crowns held at the end of the season (now, for the current one): each season has its own crowns.
  const crowns = (input.crownHistory || input.crowns || []).filter(s => s.year === year && s.holder).map(s => ({ crown: s.crown, uid: s.holder }));

  return { year, from, to, ongoing, podium: seasonPoints(year, input, now).slice(0, 3), awards, records, crowns };
}

/* What's saved for good when a season locks (seasons/{year}): the final standings (with titles and points by kind),
   the champion, the crowns held at the end, the season records and the awards. Worked out on an admin's phone. */
export function seasonSnapshot(input, year, { now = Date.now(), by = null } = {}) {
  const rows = finalTable(input, year), a = seasonAwards(year, input, now);
  const records = [];
  for (const r of speciesRecords(input.catches, year)) {
    if (r.weight) records.push({ species: r.species, field: "weightOz", catchId: r.weight.id, uid: r.weight.uid, value: r.weight.weightOz });
    if (r.length) records.push({ species: r.species, field: "lengthIn", catchId: r.length.id, uid: r.length.uid, value: r.length.lengthIn });
  }
  return {
    year, lockedAt: now, lockedBy: by,
    champion: rows[0] && rows[0].points > 0 ? rows[0].uid : null,
    standings: rows.map((r, i) => ({ uid: r.uid, place: i + 1, points: r.points, title: r.title, byKind: r.byKind })),
    crowns: (input.crownHistory || []).filter(s => s.year === year && s.holder).map(s => ({ id: s.crown.id, uid: s.holder, score: s.score })),
    records,
    awards: a.awards.map(x => ({ id: x.id, icon: x.icon, title: x.title, uid: x.uid || null, n: x.n ?? null, text: x.text || null,
      catchId: x.c ? x.c.id : null, boatId: x.boatId || null })),
  };
}
