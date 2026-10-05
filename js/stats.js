/* Personal bests and species leaderboards, worked out from the catches. Nothing here is stored;
   it is recomputed from the data, so editing or deleting a catch updates every board.
   Pure functions on plain objects: { id, uid, species, weightOz, lengthIn, caughtAt }. */

const has = n => typeof n === "number" && n > 0;
const counts = c => !c.dq;
/* A stringer is one photo of many fish (fishCount of them); everything else is one fish. */
export const isStringer = c => Number.isInteger(c.fishCount) && c.fishCount > 1;
export const fishIn = c => (isStringer(c) ? c.fishCount : 1);
/* Weight and length are optional; a fish with neither can't be compared, so it's never a PB or a record.
   Nor is a stringer, which is never measured. */
export const measured = c => !isStringer(c) && (has(c.weightOz) || has(c.lengthIn));

/* Which catch is the better personal best: heavier wins, then longer, then whoever caught it first. */
export function better(a, b) {
  if (!b) return a;
  if (!a) return b;
  const wa = has(a.weightOz) ? a.weightOz : 0, wb = has(b.weightOz) ? b.weightOz : 0;
  if (wa !== wb) return wa > wb ? a : b;
  const la = has(a.lengthIn) ? a.lengthIn : 0, lb = has(b.lengthIn) ? b.lengthIn : 0;
  if (la !== lb) return la > lb ? a : b;
  return (a.caughtAt || 0) <= (b.caughtAt || 0) ? a : b;
}

/* species -> best catch, for one angler. */
export function personalBests(catches, uid) {
  const out = new Map();
  for (const c of catches) if (c.uid === uid && counts(c) && measured(c)) out.set(c.species, better(out.get(c.species), c));
  return out;
}

export function isPersonalBest(c, catches) {
  return personalBests(catches, c.uid).get(c.species) === c;
}

/* If this catch were saved, would it beat the angler's current best? Returns { pb, previous }. */
export function checkNewPB(candidate, catches) {
  if (!measured(candidate)) return { pb: false, previous: null };
  const others = catches.filter(c => c.id !== candidate.id);
  const previous = personalBests(others, candidate.uid).get(candidate.species) || null;
  return { pb: !previous || better(previous, candidate) === candidate, previous };
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

/* Every species caught in the league, most-caught first, with its weight and length record holders. */
export function speciesRecords(catches) {
  const n = new Map();
  for (const c of catches) if (counts(c)) n.set(c.species, (n.get(c.species) || 0) + fishIn(c));
  return [...n.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([species, count]) => ({
      species, count,
      weight: speciesBoard(catches, species, "weight")[0] || null,
      length: speciesBoard(catches, species, "length")[0] || null,
    }));
}

/* Is this catch the league record (by weight or by length) for its species? */
export function recordKinds(c, catches) {
  const kinds = [];
  if (has(c.weightOz) && speciesBoard(catches, c.species, "weight")[0] === c) kinds.push("weight");
  if (has(c.lengthIn) && speciesBoard(catches, c.species, "length")[0] === c) kinds.push("length");
  return kinds;
}

export function anglerStats(catches, uid) {
  const mine = catches.filter(c => c.uid === uid && counts(c));
  return { catches: mine.reduce((n, c) => n + fishIn(c), 0), species: new Set(mine.map(c => c.species)).size };
}
