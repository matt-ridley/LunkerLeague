/* Angler rankings: points from catches, species, records and derbies, worked out from the data every time.
   Points are never stored. The admin's scoring values are versioned: every change is a new version, either
   "apply to all history" (retro) or "from now on" (forward), and each event is scored with the version in effect
   at its time. Pure functions on plain data. */
import { speciesBoard, isStringer, fishIn } from "./stats.js";
import { derbyStatus, standings, closesAt } from "./derby.js";
import { crownStandings } from "./crowns.js";
import { badgeTimeline } from "./badges.js";
import { h2hPointEvents } from "./h2h.js";

export const DEFAULT_SCORING = {
  catchPts: 1,          // per catch logged…
  dailyCap: 3,          // …counting at most this many catches per angler per day
  limitPts: 5,          // bonus for a stringer marked as a limit, once per angler per day
  speciesPts: 3,        // per species caught for the first time
  recordPts: [5, 3, 1], // holding 1st / 2nd / 3rd on a species' weight board (current standing)
  crownPts: 2,          // per crown held right now (current standing)
  badgePts: 1,          // per badge earned (kept for good)
  derbyPts: [25, 15, 10], // finishing 1st / 2nd / 3rd in a derby
  participationPts: 2,  // for every derby joined that finished
  beatPts: 0,           // per angler finished ahead of in a derby
  h2hPts: 1,            // for taking part in a head-to-head challenge (logging at least one fish)
  h2hWinPts: 3,         // bonus for winning one
  h2hMaxStake: 10,      // most points an angler can stake on one challenge
  noShowPts: 1,         // points lost for each outing an angler said "In" to and didn't show up for
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

/* Does this catch count for rankings? Not when disqualified, entered in a test derby, or a past catch (logbook).
   Records points use the board of league catches only, so a past fish can't hold record points. */
function countsForRank(c, derbies) {
  if (c.dq || c.past) return false;
  const d = c.derbyId && derbies.get(c.derbyId);
  return !(d && d.testing);
}

/* Every point-earning event: { uid, at, pts, kind, label }. */
export function rankEvents(input) {
  const { catches, derbies, entrants, versions, now = Date.now() } = input;
  const line = scoringTimeline(versions), cur = currentScoring(line);
  const derbyMap = derbies instanceof Map ? derbies : new Map((derbies || []).map(d => [d.id, d]));
  const counted = catches.filter(c => countsForRank(c, derbyMap)).sort((a, b) => a.caughtAt - b.caughtAt);
  const events = [];

  // Catches, with a daily cap per angler; and the first catch of each species each season (points start again every
  // January 1, so a species is new again too).
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
    const sk = c.uid + "|" + new Date(c.caughtAt).getFullYear();
    if (!seen.has(sk)) seen.set(sk, new Set());
    if (!seen.get(sk).has(c.species)) {
      seen.get(sk).add(c.species);
      if (v.speciesPts) events.push({ uid: c.uid, at: c.caughtAt, pts: v.speciesPts, kind: "species", label: `First ${c.species}` });
    }
  }

  // Species records: current standing on each weight board and each length board, scored with today's values.
  // (Some species are only weighed and some only measured; which counts per species is on the roadmap.)
  for (const sp of new Set(counted.map(c => c.species))) {
    for (const by of ["weight", "length"]) {
      speciesBoard(counted, sp, by).slice(0, 3).forEach((c, i) => {
        if (cur.recordPts[i]) events.push({ uid: c.uid, at: now, pts: cur.recordPts[i], kind: "record", label: `${["1st", "2nd", "3rd"][i]} on the ${sp} ${by} board (league catches)`, standing: true });
      });
    }
  }

  // Crowns: whoever holds each one right now, scored with today's values.
  if (cur.crownPts) {
    for (const s of input.crowns || crownStandings({ ...input, derbies: derbyMap })) {
      if (s.holder) events.push({ uid: s.holder, at: now, pts: cur.crownPts, kind: "crown", label: `${s.crown.icon} ${s.crown.name} crown`, standing: true });
    }
  }

  // Badges: each one counts from when it was earned, with the values in effect then.
  for (const b of input.badges || badgeTimeline({ ...input, derbies: derbyMap })) {
    const v = scoringAt(line, b.at);
    if (v.badgePts && !b.badge.noPoints) events.push({ uid: b.uid, at: b.at, pts: v.badgePts, kind: "badge", label: `${b.badge.icon} ${b.badge.name} badge` });
  }

  // No-shows: points lost for each outing an angler said "In" to and didn't turn up for (from when it was marked).
  for (const [tid, marks] of input.noShows || new Map()) {
    const t = (input.trips || new Map()).get(tid);
    if (!t) continue;
    for (const [u, m] of marks) {
      const v = scoringAt(line, m.at || 0);
      if (v.noShowPts) events.push({ uid: u, at: m.at || 0, pts: -v.noShowPts, kind: "noshow", label: `🫥 No-show: ${t.title}` });
    }
  }

  // Finished derbies (not cancelled, not tests): places, joining, and anglers beaten.
  for (const d of derbyMap.values()) {
    // Derbies that ended before the league start (pre-season) keep their results but earn no points.
    if (d.testing || derbyStatus(d, now) !== "ended" || d.end < (input.leagueStart || 0)) continue;
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
  // Head-to-head challenges: taking part, winning, and staked points moving from loser to winner.
  events.push(...h2hPointEvents([...(input.challenges ? input.challenges.values() : [])], catches, t => scoringAt(line, t),
    input.name || (() => "another angler"), now));
  return events;
}

/* Ranked table: [{ uid, points, byKind, events, title }], highest first. `since` limits to a season
   (current standings for records always count). Seasons (season.js) build every season's table in one pass. */
export function rankings(input, { since = -Infinity } = {}) {
  return rankTable(rankEvents(input).filter(e => e.standing || e.at >= since), input);
}

/* The ranked table for some events: every active member (0 points if none), titles from the current values. */
export function rankTable(events, input) {
  const cur = currentScoring(scoringTimeline(input.versions));
  const by = new Map();
  const blank = u => ({ uid: u, points: 0, byKind: { catch: 0, limit: 0, species: 0, record: 0, crown: 0, badge: 0, derby: 0, h2h: 0, noshow: 0 }, events: [] });
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

/* Badges live in badges.js; re-exported here for the screens and tests that already import them from rankings. */
export { BADGES, badgeTimeline, badgesFor } from "./badges.js";
