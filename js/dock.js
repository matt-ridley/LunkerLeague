/* The Dock: the lists behind its pages (anglers and everyone's tackle boxes), kept pure so they can be tested. */
import { fishIn, measured, personalBests, speciesBoard, leagueCatches, seasonCatches } from "./stats.js";

const byName = (a, b) => (a.displayName || "").localeCompare(b.displayName || "");
const has = n => typeof n === "number" && n > 0;
const dayKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

/* The ways the anglers list can be sorted: [key, label]. */
export const ANGLER_SORTS = [
  ["fish", "Most fish"], ["points", "Points"], ["species", "Most species"], ["pbs", "Most PBs"], ["records", "Most records"],
  ["biggest", "Heaviest fish"], ["longest", "Longest fish"], ["daysOut", "Most days out"], ["crowns", "Most crowns"],
  ["badges", "Most badges"], ["lastAt", "Latest fish"], ["name", "Name (A to Z)"],
];

/* Every active angler with their numbers for a period: "season" (this season's league catches: from January 1, or
   from the league start when an admin set it later, as in the 2026 Preseason) or "career" (every league catch).
   Logbook (past) and disqualified catches never count, except that PBs come from every catch (there's only one PB).
   - fish: a stringer counts its fish; species: different species caught
   - pbs: personal bests held (career), or held and caught this season
   - records: weight and length boards topped, this season's boards (season) or the league records (career)
   - biggest / longest: the heaviest and longest single fish (null if none weighed or measured)
   - daysOut: different days with a catch; lastAt: the latest league catch ever (null if none)
   - points, place, crowns, badges: from `extra` (Map uid -> { points, place, crowns, badges }), worked out by the page. */
export function anglerRoster({ members, catches = [], period = "season", year = new Date(Date.now()).getFullYear(), extra = new Map() }) {
  const ok = catches.filter(c => !c.dq);
  const pool = period === "career" ? leagueCatches(ok) : seasonCatches(ok, year);
  // Who tops each species board (weight and length), counted once per board.
  const holders = new Map();
  for (const sp of new Set(pool.map(c => c.species))) for (const by of ["weight", "length"]) {
    const top = speciesBoard(pool, sp, by)[0];
    if (top) holders.set(top.uid, (holders.get(top.uid) || 0) + 1);
  }
  return members.filter(m => !m.suspended).slice().sort(byName).map(m => {
    const mine = pool.filter(c => c.uid === m.id), single = mine.filter(measured);
    const pbs = [...personalBests(ok, m.id).values()].filter(c => period === "career" || (!c.past && new Date(c.caughtAt).getFullYear() === year)).length;
    const max = f => single.reduce((best, c) => (has(c[f]) && c[f] > (best ?? 0) ? c[f] : best), null);
    const x = extra.get(m.id) || {};
    return {
      member: m,
      fish: mine.reduce((n, c) => n + fishIn(c), 0),
      species: new Set(mine.map(c => c.species)).size,
      pbs,
      records: holders.get(m.id) || 0,
      biggest: max("weightOz"),
      longest: max("lengthIn"),
      daysOut: new Set(mine.map(c => dayKey(c.caughtAt))).size,
      lastAt: leagueCatches(ok).filter(c => c.uid === m.id).reduce((t, c) => Math.max(t, c.caughtAt || 0), 0) || null,
      points: x.points ?? 0, place: x.place ?? null, crowns: x.crowns ?? 0, badges: x.badges ?? 0,
    };
  });
}

/* The roster sorted by one of ANGLER_SORTS: highest first (points by place), ties and "name" A to Z. Anglers
   with no heaviest/longest fish or no fish at all go to the bottom of those sorts. */
export function sortRoster(rows, sort = "fish") {
  const name = (a, b) => byName(a.member, b.member);
  const num = r => (sort === "points" ? -(r.place ?? Infinity) : r[sort] ?? -Infinity);
  return rows.slice().sort((a, b) => (sort === "name" ? 0 : num(b) - num(a) || 0) || name(a, b));
}

/* Each sorted row's place in the list (1, 2, 3…), with ties sharing a place (1, 2, 2, 4). By name it's just the
   position; an angler with nothing to rank (no weighed fish for heaviest) has none (null). Points go by the table's places, which are already worked out. */
export function rosterPlaces(sorted, sort = "fish") {
  const val = r => (sort === "points" ? r.points : r[sort] ?? null);
  return sorted.map((r, i) => {
    if (sort === "name") return i + 1;
    if (val(r) == null) return null;
    let j = i;
    while (j > 0 && val(sorted[j - 1]) === val(r)) j--;
    return j + 1;
  });
}

/* Everyone's tackle box: yours first, then the fullest boxes, then A to Z. Retired tackle isn't counted. */
export function tackleBoxes({ members, items = new Map(), me }) {
  const count = new Map();
  for (const i of items.values()) if (!i.retired) count.set(i.uid, (count.get(i.uid) || 0) + 1);
  return members.filter(m => !m.suspended).map(m => ({ member: m, items: count.get(m.id) || 0 }))
    .sort((a, b) => (b.member.id === me) - (a.member.id === me) || b.items - a.items || byName(a.member, b.member));
}
