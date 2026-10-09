/* Personal bests and species leaderboards, worked out from the catches. Nothing here is stored;
   it is recomputed from the data, so editing or deleting a catch updates every board.
   Pure functions on plain objects: { id, uid, species, weightOz, lengthIn, caughtAt }. */

const has = n => typeof n === "number" && n > 0;
const counts = c => !c.dq;
/* A past catch (logbook): caught before the league started, or logged more than `graceDays` after it was caught.
   It counts for personal bests and the all-time record boards, but never for points, badges or crowns. Saved on
   the catch as `past: true` when it's created, and the security rules never let it change back. */
export const DEFAULT_GRACE_DAYS = 7;
/* The league start: set by an admin (startAt), or when the league was set up. */
export const leagueStartOf = league => (league && (league.startAt ?? league.createdAt)) || 0;
/* Logged too late: saved on the catch as `past: true` and locked by the security rules. */
export const loggedLate = ({ caughtAt, createdAt }, graceDays = DEFAULT_GRACE_DAYS) => caughtAt < createdAt - graceDays * 24 * 3600 * 1000;
/* Past for either reason. "Before the start" is worked out live, so moving the start date re-sorts catches. */
export function pastCatch(c, { leagueStart = 0, graceDays = DEFAULT_GRACE_DAYS } = {}) {
  return c.caughtAt < leagueStart || loggedLate(c, graceDays);
}
export const isPast = c => c.past === true;

/* A stringer is one photo of many fish (fishCount of them); everything else is one fish. */
export const isStringer = c => Number.isInteger(c.fishCount) && c.fishCount > 1;
export const fishIn = c => (isStringer(c) ? c.fishCount : 1);
/* Weight and length are optional; a fish with neither can't be compared, so it's never a PB or a record.
   Nor is a stringer, which is never measured. */
export const measured = c => !isStringer(c) && (has(c.weightOz) || has(c.lengthIn));

/* Which catch is the better personal best: heavier wins (when both were weighed), then longer (when both were
   measured). A fish only beats another on a measurement they both have: a 10 lb fish doesn't beat a 50 inch one
   that was never weighed. When they can't be told apart, the one caught first stands. */
export function better(a, b) {
  if (!b) return a;
  if (!a) return b;
  if (has(a.weightOz) && has(b.weightOz) && a.weightOz !== b.weightOz) return a.weightOz > b.weightOz ? a : b;
  if (has(a.lengthIn) && has(b.lengthIn) && a.lengthIn !== b.lengthIn) return a.lengthIn > b.lengthIn ? a : b;
  return (a.caughtAt || 0) <= (b.caughtAt || 0) ? a : b;
}
const byTime = (a, b) => (a.caughtAt || 0) - (b.caughtAt || 0);

/* species -> best catch, for one angler (past catches included: there's only ever one PB). Gone through in the
   order caught, so a fish only takes the PB by beating the one before it. */
export function personalBests(catches, uid) {
  const out = new Map();
  for (const c of [...catches].sort(byTime)) if (c.uid === uid && counts(c) && measured(c)) out.set(c.species, better(out.get(c.species), c));
  return out;
}

export function isPersonalBest(c, catches) {
  return personalBests(catches, c.uid).get(c.species) === c;
}

/* If this catch were saved, would it beat the angler's current best? Returns { pb, previous, first }:
   `first` when it's their first catch of the species at all (measured or not, past catches included). */
export function checkNewPB(candidate, catches) {
  const others = catches.filter(c => c.id !== candidate.id);
  const first = !others.some(c => c.uid === candidate.uid && c.species === candidate.species && counts(c));
  if (!measured(candidate)) return { pb: false, previous: null, first };
  const previous = personalBests(others, candidate.uid).get(candidate.species) || null;
  return { pb: !previous || better(previous, candidate) === candidate, previous, first };
}

/* Best catch per angler for one species, ranked by weight or length. Only catches with that measurement count. */
export function speciesBoard(catches, species, by = "weight") {
  const field = by === "length" ? "lengthIn" : "weightOz";
  const best = new Map();
  for (const c of catches) {
    if (c.species !== species || !counts(c) || !measured(c) || !has(c[field])) continue;
    const cur = best.get(c.uid);
    if (!cur || c[field] > cur[field] || (c[field] === cur[field] && (c.caughtAt || 0) < (cur.caughtAt || 0))) best.set(c.uid, c);
  }
  return [...best.values()].sort((a, b) => b[field] - a[field] || (a.caughtAt || 0) - (b.caughtAt || 0));
}

/* Three kinds of record. Season records come from the league catches caught in one season (the calendar year): the
   boards worth points, starting again every January 1. League records are the best league catches ever (the Hall
   of Fame). All-time records include past catches (props, no points); one is only shown separately when a past
   catch beats the league record. */
export const leagueCatches = catches => catches.filter(c => !c.past);
const yearOf = ms => new Date(ms).getFullYear();
export const seasonCatches = (catches, year) => catches.filter(c => !c.past && yearOf(c.caughtAt) === year);

/* Every species caught, most-caught first (league catches; species seen only in past catches come last), with
   the season's weight and length records (`year`, default this one), the league records when a fish from another
   season holds them, and any all-time records held by past catches. `count` is the fish caught in the season. */
export function speciesRecords(catches, year = yearOf(Date.now())) {
  const league = leagueCatches(catches), season = seasonCatches(catches, year), n = new Map();
  for (const c of catches) if (counts(c)) n.set(c.species, (n.get(c.species) || 0) + (!c.past && yearOf(c.caughtAt) === year ? fishIn(c) : 0));
  const top = (pool, sp, by) => speciesBoard(pool, sp, by)[0] || null;
  const other = (a, b) => (a && a !== b ? a : null);
  return [...n.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([species, count]) => {
      const weight = top(season, species, "weight"), length = top(season, species, "length");
      const leagueWeight = top(league, species, "weight"), leagueLength = top(league, species, "length");
      const allW = top(catches, species, "weight"), allL = top(catches, species, "length");
      return { species, count, weight, length, leagueWeight: other(leagueWeight, weight), leagueLength: other(leagueLength, length),
        allTimeWeight: allW && allW.past ? allW : null, allTimeLength: allL && allL.past ? allL : null };
    });
}

/* Is this catch a record (by weight or by length) for its species? A league catch is checked against league
   catches (the league record); a past catch against everything (the all-time record). */
export function recordKinds(c, catches) {
  const pool = c.past ? catches : leagueCatches(catches), kinds = [];
  if (has(c.weightOz) && speciesBoard(pool, c.species, "weight")[0] === c) kinds.push("weight");
  if (has(c.lengthIn) && speciesBoard(pool, c.species, "length")[0] === c) kinds.push("length");
  return kinds;
}

/* Is this catch top of its season's board (by weight or by length)? League catches only. */
export function seasonRecordKinds(c, catches) {
  if (c.past) return [];
  const pool = seasonCatches(catches, yearOf(c.caughtAt)), kinds = [];
  if (has(c.weightOz) && speciesBoard(pool, c.species, "weight")[0] === c) kinds.push("weight");
  if (has(c.lengthIn) && speciesBoard(pool, c.species, "length")[0] === c) kinds.push("length");
  return kinds;
}

/* The biggest record a catch holds: { level, kinds, year } or null. "past": a logbook catch on top of the all-time
   board; "league": the best league catch ever (it's also its season's record); "season": the best of its season. */
export function recordOf(c, catches) {
  const year = yearOf(c.caughtAt), all = recordKinds(c, catches);
  if (all.length) return { level: c.past ? "past" : "league", kinds: all, year };
  const sk = seasonRecordKinds(c, catches);
  return sk.length ? { level: "season", kinds: sk, year } : null;
}

/* A season best (SB): the angler's best of the species in the season it was caught (past catches included, like PBs). */
export function isSeasonBest(c, catches) {
  const year = yearOf(c.caughtAt);
  return personalBests(catches.filter(x => x.uid === c.uid && yearOf(x.caughtAt) === year), c.uid).get(c.species) === c;
}

export function anglerStats(catches, uid) {
  const mine = catches.filter(c => c.uid === uid && counts(c));
  return { catches: mine.reduce((n, c) => n + fishIn(c), 0), species: new Set(mine.map(c => c.species)).size };
}
