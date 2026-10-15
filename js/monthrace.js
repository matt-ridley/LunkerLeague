/* Angler of the Month: each month's race (see months.js), worked out from the season points.
   Pure functions on plain data. */
import { rankEvents, rankTable } from "./rank.js";
import { fishIn, better, measured } from "./stats.js";
import { monthRange, MIN_ANGLERS, BOARD_SIZE } from "./months.js";

const asMap = x => (x instanceof Map ? x : new Map((x || []).map(d => [d.id, d])));

/* Is this catch a league catch for the race? (As for points: not disqualified, not a logbook catch, not a test derby.) */
const counts = (c, derbies) => {
  if (c.dq || c.past) return false;
  const d = c.derbyId && derbies.get(c.derbyId);
  return !(d && d.testing);
};

/* The month's board: { key, rows: [{ uid, points, fish, biggest, place }], anglers (how many logged a catch), winner }.
   Ties go to the most fish that month, then the biggest fish. `events`: rankEvents(input), when already worked out. */
export function monthBoard(input, key, events = null) {
  const { from, to } = monthRange(key), inM = t => t >= from && t <= to;
  const all = events || rankEvents(input);
  // Points earned on a date in the month. Not the month prizes themselves (bonus points and the badge).
  const dated = all.filter(e => !e.standing && e.kind !== "month" && e.badge !== "aotm" && inM(e.at));
  const derbies = asMap(input.derbies);
  const fish = new Map(), biggest = new Map();
  for (const c of input.catches || []) {
    if (!inM(c.caughtAt) || !counts(c, derbies)) continue;
    fish.set(c.uid, (fish.get(c.uid) || 0) + fishIn(c));
    if (measured(c)) biggest.set(c.uid, better(biggest.get(c.uid), c));
  }
  const table = rankTable(dated, { ...input, members: [] });
  const ids = new Set([...table.map(r => r.uid), ...fish.keys()]);
  const pts = new Map(table.map(r => [r.uid, r.points]));
  const rows = [...ids].map(uid => ({ uid, points: pts.get(uid) || 0, fish: fish.get(uid) || 0, biggest: biggest.get(uid) || null }))
    .filter(r => r.points !== 0 || r.fish)
    .sort((a, b) => b.points - a.points || b.fish - a.fish || bigger(a.biggest, b.biggest) || a.uid.localeCompare(b.uid))
    .map((r, i) => ({ ...r, place: i + 1 }));
  const anglers = fish.size;
  const winner = anglers >= MIN_ANGLERS && rows[0] && rows[0].points > 0 ? rows[0].uid : null;
  return { key, rows, anglers, winner };
}
/* Sorts the bigger fish first: heavier, then longer (no fish last). */
const bigger = (a, b) => ((b && b.weightOz) || 0) - ((a && a.weightOz) || 0) || ((b && b.lengthIn) || 0) - ((a && a.lengthIn) || 0);

/* What's saved when a month locks (months/{key}). */
export function monthSnapshot(input, key, { now = Date.now(), by } = {}) {
  const b = monthBoard(input, key);
  const top = b.winner ? b.rows[0] : null;
  return {
    key, winner: b.winner, points: top ? top.points : 0, fish: top ? top.fish : 0, anglers: b.anglers,
    board: b.rows.slice(0, BOARD_SIZE).map(r => ({ uid: r.uid, place: r.place, points: r.points, fish: r.fish })),
    lockedAt: now, lockedBy: by,
  };
}

