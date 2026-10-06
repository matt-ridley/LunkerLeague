/* Derby rules and standings, worked out from the entries. Pure functions on plain data, so they can be tested
   and every phone gets the same answer. Times are epoch milliseconds. */

export const SCORING = {
  heaviest: { label: "Heaviest single fish", needs: "weight" },
  longest: { label: "Longest single fish", needs: "length" },
  bag: { label: "Heaviest bag (best N fish)", needs: "weight" },
  most: { label: "Most fish caught", needs: null },
  species: { label: "Most species caught", needs: null },
};
export const PROOF = {
  any: "A clear photo of the fish",
  scale: "Photo of the fish on a scale, showing the reading",
  board: "Photo of the fish on a measuring board",
  both: "Photos showing both the scale and the measuring board",
};

export const DEFAULTS = {
  name: "", description: "", start: 0, end: 0, syncGraceHours: 24, species: [], scoring: "heaviest", bagSize: 5,
  minWeightOz: 0, minLengthIn: 0, maxEntries: 0, proof: "any", requireLocation: false, catchRelease: false,
  requireCrew: false, prizeNote: "", cancelled: false,
  testing: false, entryFee: 0, addedMoney: 0, payoutPcts: [100], unpaidCanWin: false, captainPct: 0, netmanPct: 0, roundTo: 1, sidePotFee: 0,
};

const HOUR = 3600 * 1000;
export const closesAt = d => d.end + (d.syncGraceHours || 0) * HOUR;

/* Where a copied derby goes: the same weekday, time of day and length, moved on a whole number of weeks (at least
   one) until it starts in the future. Dates are moved on the calendar, so 6 AM stays 6 AM across a clock change. */
export function nextDates(start, end, now = Date.now()) {
  const s = new Date(start), e = new Date(end);
  do { s.setDate(s.getDate() + 7); e.setDate(e.getDate() + 7); } while (s.getTime() <= now);
  return { start: s.getTime(), end: e.getTime() };
}

/* upcoming → active → closing (fishing over, late entries from no-signal spots still accepted) → ended */
export function derbyStatus(d, now = Date.now()) {
  if (d.cancelled) return "cancelled";
  if (now < d.start) return "upcoming";
  if (now <= d.end) return "active";
  if (now <= closesAt(d)) return "closing";
  return "ended";
}
export const STATUS_LABEL = { upcoming: "Upcoming", active: "Live now", closing: "Final entries", ended: "Finished", cancelled: "Cancelled" };

/* Why a catch doesn't count in this derby, or "" if it does. Checked again here even though the rules check it,
   because derby settings can change after a catch was entered. */
export function entryProblem(c, d) {
  if (c.dq) return `Disqualified${c.dqReason ? ": " + c.dqReason : ""}`;
  if (c.fishCount != null) return "Stringers can't be entered in a derby";
  // The saved flag (logged too late): catches from before a later league start keep their derby results.
  if (c.pastStored ?? c.past) return "Past catches can't be entered in a derby";
  if (c.caughtAt < d.start || c.caughtAt > d.end) return "Caught outside the derby time";
  if (d.species && d.species.length && !d.species.includes(c.species)) return "Species doesn't count in this derby";
  const needs = (SCORING[d.scoring] || {}).needs;
  if (needs === "weight" && !(c.weightOz > 0)) return "Needs a weight";
  if (needs === "length" && !(c.lengthIn > 0)) return "Needs a length";
  if (d.minWeightOz > 0 && !(c.weightOz >= d.minWeightOz)) return "Under the minimum weight";
  if (d.minLengthIn > 0 && !(c.lengthIn >= d.minLengthIn)) return "Under the minimum length";
  if (d.catchRelease && !c.released) return "Must be released";
  if (d.requireLocation && !c.locShared) return "Needs a shared spot";
  if (d.requireCrew && (!c.captain || !c.netman)) return "Needs a captain and net man";
  return "";
}

/* Every entry in the derby, each with `problem` ("" when it counts). Entries past an angler's limit don't count. */
export function derbyEntries(d, catches, entrants) {
  const mine = catches.filter(c => c.derbyId === d.id && (!entrants || entrants.has(c.uid)))
    .sort((a, b) => (a.caughtAt - b.caughtAt) || ((a.createdAt || 0) - (b.createdAt || 0)));
  const used = new Map();
  return mine.map(c => {
    let problem = entryProblem(c, d);
    if (!problem && d.maxEntries > 0) {
      const n = (used.get(c.uid) || 0) + 1;
      used.set(c.uid, n);
      if (n > d.maxEntries) problem = `Over the limit of ${d.maxEntries} entries`;
    }
    return { ...c, problem };
  });
}

/* Ranked standings: [{ uid, score, fish: [counted catches], decidedAt }], best first.
   Ties go to whoever got there first (decidedAt: when their score was reached). */
export function standings(d, catches, entrants) {
  const by = new Map();
  for (const e of derbyEntries(d, catches, entrants)) {
    if (e.problem) continue;
    if (!by.has(e.uid)) by.set(e.uid, []);
    by.get(e.uid).push(e); // in time order
  }
  const rows = [];
  for (const [uid, fish] of by) {
    let score = 0, counted = [], decidedAt = 0;
    if (d.scoring === "heaviest" || d.scoring === "longest") {
      const f = d.scoring === "heaviest" ? "weightOz" : "lengthIn";
      const best = fish.reduce((a, b) => (b[f] > a[f] ? b : a));
      score = best[f]; counted = [best]; decidedAt = best.caughtAt;
    } else if (d.scoring === "bag") {
      counted = [...fish].sort((a, b) => b.weightOz - a.weightOz || a.caughtAt - b.caughtAt).slice(0, Math.max(1, d.bagSize || 1));
      score = Math.round(counted.reduce((s, c) => s + c.weightOz, 0) * 10) / 10;
      decidedAt = Math.max(...counted.map(c => c.caughtAt));
    } else if (d.scoring === "most") {
      counted = fish; score = fish.length; decidedAt = fish[fish.length - 1].caughtAt;
    } else if (d.scoring === "species") {
      const first = new Map();
      for (const c of fish) if (!first.has(c.species)) first.set(c.species, c);
      counted = [...first.values()]; score = counted.length; decidedAt = Math.max(...counted.map(c => c.caughtAt));
    }
    rows.push({ uid, score, fish: counted, decidedAt, biggest: Math.max(...fish.map(c => c.weightOz || 0)) });
  }
  return rows.sort((a, b) => b.score - a.score || (d.scoring === "bag" ? b.biggest - a.biggest : 0) || a.decidedAt - b.decidedAt);
}
