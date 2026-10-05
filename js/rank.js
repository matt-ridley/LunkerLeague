/* Angler rankings: points from catches, species, records and derbies, worked out from the data every time.
   Points are never stored. The admin's scoring values are versioned: every change is a new version, either
   "apply to all history" (retro) or "from now on" (forward), and each event is scored with the version in effect
   at its time. Pure functions on plain data. */
import { speciesBoard, isStringer, fishIn } from "./stats.js";
import { derbyStatus, standings, closesAt } from "./derby.js";

export const DEFAULT_SCORING = {
  catchPts: 1,          // per catch logged…
  dailyCap: 3,          // …counting at most this many catches per angler per day
  limitPts: 5,          // bonus for a stringer marked as a limit, once per angler per day
  speciesPts: 3,        // per species caught for the first time
  recordPts: [5, 3, 1], // holding 1st / 2nd / 3rd on a species' weight board (current standing)
  derbyPts: [25, 15, 10], // finishing 1st / 2nd / 3rd in a derby
  participationPts: 2,  // for every derby joined that finished
  beatPts: 0,           // per angler finished ahead of in a derby
  titles: [0, 10, 25, 50, 100, 175, 275],
};
export const TITLES = ["Bait Bucket", "Minnow Wrangler", "Dock Dangler", "Weekend Warrior", "Lunker Hunter", "Hawg Boss", "Legend of the Lake"];

const values = v => ({ ...DEFAULT_SCORING, ...(v || {}) });

/* Turns the saved versions into a timeline of { from, values }. Versions are applied in the order they were saved:
   a retro version replaces the whole timeline; a forward one takes over from its effectiveFrom time. */
export function scoringTimeline(versions) {
  let line = [{ from: -Infinity, values: values(), id: "default" }];
  for (const v of [...(versions || [])].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))) {
    if (v.mode === "retro") line = [{ from: -Infinity, values: values(v.values), id: v.id }];
    else line = [...line.filter(seg => seg.from < v.effectiveFrom), { from: v.effectiveFrom, values: values(v.values), id: v.id }];
  }
  return line;
}
export function scoringAt(line, t) {
  let cur = line[0];
  for (const seg of line) if (seg.from <= t) cur = seg;
  return cur.values;
}
export const currentScoring = line => line[line.length - 1].values;

const dayKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

/* Does this catch count for rankings? Not when disqualified, or entered in a test derby. */
function countsForRank(c, derbies) {
  if (c.dq) return false;
  const d = c.derbyId && derbies.get(c.derbyId);
  return !(d && d.testing);
}

/* Every point-earning event: { uid, at, pts, kind, label }. */
export function rankEvents({ catches, derbies, entrants, versions, now = Date.now() }) {
  const line = scoringTimeline(versions), cur = currentScoring(line);
  const derbyMap = derbies instanceof Map ? derbies : new Map((derbies || []).map(d => [d.id, d]));
  const counted = catches.filter(c => countsForRank(c, derbyMap)).sort((a, b) => a.caughtAt - b.caughtAt);
  const events = [];

  // Catches, with a daily cap per angler; and the first catch of each species.
  // A stringer fills whatever is left of that day's cap, and a limit adds a bonus once a day.
  const perDay = new Map(), seen = new Map(), limitDays = new Set();
  for (const c of counted) {
    const v = scoringAt(line, c.caughtAt);
    const k = c.uid + "|" + dayKey(c.caughtAt), used = perDay.get(k) || 0;
    if (isStringer(c)) {
      const slots = Math.max(0, v.dailyCap - used);
      perDay.set(k, Math.max(used, v.dailyCap));
      if (slots && v.catchPts) events.push({ uid: c.uid, at: c.caughtAt, pts: slots * v.catchPts, kind: "catch", label: `Stringer of ${c.fishCount} ${c.species}` });
      if (c.limit && v.limitPts && !limitDays.has(k)) {
        limitDays.add(k);
        events.push({ uid: c.uid, at: c.caughtAt, pts: v.limitPts, kind: "limit", label: `Limited out on ${c.species}` });
      }
    } else {
      perDay.set(k, used + 1);
      if (used < v.dailyCap && v.catchPts) events.push({ uid: c.uid, at: c.caughtAt, pts: v.catchPts, kind: "catch", label: `Caught a ${c.species}` });
    }
    if (!seen.has(c.uid)) seen.set(c.uid, new Set());
    if (!seen.get(c.uid).has(c.species)) {
      seen.get(c.uid).add(c.species);
      if (v.speciesPts) events.push({ uid: c.uid, at: c.caughtAt, pts: v.speciesPts, kind: "species", label: `First ${c.species}` });
    }
  }

  // Species records: current standing on each weight board, scored with today's values.
  for (const sp of new Set(counted.map(c => c.species))) {
    speciesBoard(counted, sp, "weight").slice(0, 3).forEach((c, i) => {
      if (cur.recordPts[i]) events.push({ uid: c.uid, at: now, pts: cur.recordPts[i], kind: "record", label: `${["1st", "2nd", "3rd"][i]} on the ${sp} board`, standing: true });
    });
  }

  // Finished derbies (not cancelled, not tests): places, joining, and anglers beaten.
  for (const d of derbyMap.values()) {
    if (d.testing || derbyStatus(d, now) !== "ended") continue;
    const ent = (entrants && entrants.get(d.id)) || new Map();
    const v = scoringAt(line, d.end);
    const rows = standings(d, catches, ent);
    for (const u of ent.keys()) if (v.participationPts) events.push({ uid: u, at: d.end, pts: v.participationPts, kind: "derby", label: `Fished ${d.name}` });
    rows.forEach((r, i) => {
      if (v.derbyPts[i]) events.push({ uid: r.uid, at: d.end, pts: v.derbyPts[i], kind: "derby", label: `${["Won", "2nd in", "3rd in"][i]} ${d.name}` });
      const beaten = Math.max(0, ent.size - i - 1);
      if (v.beatPts && beaten) events.push({ uid: r.uid, at: d.end, pts: v.beatPts * beaten, kind: "derby", label: `Beat ${beaten} in ${d.name}` });
    });
  }
  return events;
}

/* Ranked table: [{ uid, points, byKind, events, title }], highest first. `since` limits to a season
   (current standings for records always count). */
export function rankings(input, { since = -Infinity } = {}) {
  const events = rankEvents(input).filter(e => e.standing || e.at >= since);
  const cur = currentScoring(scoringTimeline(input.versions));
  const by = new Map();
  const blank = u => ({ uid: u, points: 0, byKind: { catch: 0, limit: 0, species: 0, record: 0, derby: 0 }, events: [] });
  for (const u of input.members || []) by.set(u, blank(u));
  for (const e of events) {
    if (!by.has(e.uid)) by.set(e.uid, blank(e.uid));
    const r = by.get(e.uid);
    r.points += e.pts; r.byKind[e.kind] += e.pts; r.events.push(e);
  }
  return [...by.values()].map(r => ({ ...r, points: Math.round(r.points * 10) / 10, title: titleFor(r.points, cur) }))
    .sort((a, b) => b.points - a.points || a.uid.localeCompare(b.uid));
}

export function titleFor(points, scoring = DEFAULT_SCORING) {
  const t = scoring.titles || DEFAULT_SCORING.titles;
  let i = 0;
  for (let k = 0; k < t.length; k++) if (points >= t[k]) i = k;
  return TITLES[Math.min(i, TITLES.length - 1)];
}

/* Fixed badges (no points), for bragging rights. */
export const BADGES = [
  { id: "first", icon: "🐟", name: "First Fish", test: s => s.catches >= 1 },
  { id: "ten", icon: "🌈", name: "10 Species", test: s => s.species >= 10 },
  { id: "champ", icon: "🏆", name: "Derby Champ", test: s => s.derbyWins >= 1 },
  { id: "release", icon: "🔄", name: "Catch & Release Hero", test: s => s.released >= 10 },
  { id: "owl", icon: "🦉", name: "Night Owl", test: s => s.night >= 1 },
  { id: "net", icon: "🥅", name: "Lucky Net", test: s => s.luckyNet >= 1 },
];
/* When each angler earned each badge: [{ uid, badge, at }], oldest first. Replays the catches (by time caught) and
   finished derbies (when their final entries closed) in order, so the end result matches badgesFor. */
export function badgeTimeline({ catches, derbies, entrants, now = Date.now() }) {
  const derbyMap = derbies instanceof Map ? derbies : new Map((derbies || []).map(d => [d.id, d]));
  const steps = catches.filter(c => countsForRank(c, derbyMap)).map(c => ({ at: c.caughtAt, c }));
  for (const d of derbyMap.values()) {
    if (d.testing || derbyStatus(d, now) !== "ended") continue;
    const top = standings(d, catches, (entrants && entrants.get(d.id)) || new Map())[0];
    if (top) steps.push({ at: closesAt(d), top });
  }
  steps.sort((a, b) => a.at - b.at);
  const stats = new Map(), out = [];
  const of = u => {
    if (!stats.has(u)) stats.set(u, { catches: 0, speciesSet: new Set(), species: 0, released: 0, night: 0, derbyWins: 0, luckyNet: 0, has: new Set() });
    return stats.get(u);
  };
  const check = (u, at) => {
    const s = of(u);
    for (const b of BADGES) if (!s.has.has(b.id) && b.test(s)) { s.has.add(b.id); out.push({ uid: u, badge: b, at }); }
  };
  for (const { at, c, top } of steps) {
    if (c) {
      const s = of(c.uid), h = new Date(c.caughtAt).getHours();
      s.catches += fishIn(c); s.speciesSet.add(c.species); s.species = s.speciesSet.size;
      if (c.released) s.released++;
      if (h >= 21 || h < 4) s.night++;
      check(c.uid, at);
    } else {
      of(top.uid).derbyWins++; check(top.uid, at);
      const nets = new Set(top.fish.filter(f => f.netman && f.netman.uid && f.netman.uid !== f.uid).map(f => f.netman.uid));
      for (const n of nets) { of(n).luckyNet++; check(n, at); }
    }
  }
  return out;
}

export function badgesFor(uid, { catches, derbies, entrants, now = Date.now() }) {
  const derbyMap = derbies instanceof Map ? derbies : new Map((derbies || []).map(d => [d.id, d]));
  const mine = catches.filter(c => c.uid === uid && countsForRank(c, derbyMap));
  const s = {
    catches: mine.reduce((n, c) => n + fishIn(c), 0), species: new Set(mine.map(c => c.species)).size,
    released: mine.filter(c => c.released).length,
    night: mine.filter(c => { const h = new Date(c.caughtAt).getHours(); return h >= 21 || h < 4; }).length,
    derbyWins: 0, luckyNet: 0,
  };
  for (const d of derbyMap.values()) {
    if (d.testing || derbyStatus(d, now) !== "ended") continue;
    const top = standings(d, catches, (entrants && entrants.get(d.id)) || new Map())[0];
    if (!top) continue;
    if (top.uid === uid) s.derbyWins++;
    if (top.fish.some(f => f.netman && f.netman.uid === uid && f.uid !== uid)) s.luckyNet++;
  }
  return BADGES.filter(b => b.test(s));
}
