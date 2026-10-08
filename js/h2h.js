/* Head-to-head challenges: one angler challenges another, the two agree the terms (offers and counters), and the
   catches decide it. Pure functions on plain data, so they can be tested and every phone gets the same answer.
   Times are epoch milliseconds.

   A challenge: { id, from, to, terms, status, turn, counters, createdAt, updatedAt, acceptedAt, vetoed, vetoedAt, vetoedBy }
   - terms: { win, bagSize, species: [], start, end, stake, money, note }
   - status: "open" (waiting for `turn` to answer), "accepted", "declined" or "withdrawn". Expired, live and finished
     are worked out from the times. */
import { isStringer, fishIn } from "./stats.js";
import { fmtWeight, fmtLength } from "./ui.js";

export const WIN = {
  heaviest: { label: "Biggest fish by weight", short: "Heaviest fish" },
  longest: { label: "Biggest fish by length", short: "Longest fish" },
  most: { label: "Most fish", short: "Most fish" },
  bag: { label: "Best total weight of the top fish", short: "Top fish total" },
};
export const MAX_DAYS = 31;       // longest a challenge can run
export const LATE_HOURS = 12;     // catches made during it can still sync this long after it ends (no-signal spots)
export const MAX_COUNTERS = 20;
const HOUR = 3600 * 1000;

export const closesAt = ch => ch.terms.end + LATE_HOURS * HOUR;
export const otherSide = (ch, me) => (ch.from === me ? ch.to : ch.from);
export const involves = (ch, u) => ch.from === u || ch.to === u;
export const winLabel = t => t.win === "bag" ? `Best ${t.bagSize} fish total weight` : WIN[t.win].label;

/* open → (accepted) upcoming → live → closing (late catches still syncing) → done; or expired, declined, withdrawn,
   vetoed. An offer nobody has accepted by the start time expires. */
export function challengeStatus(ch, now = Date.now()) {
  if (ch.vetoed) return "vetoed";
  if (ch.status === "declined" || ch.status === "withdrawn") return ch.status;
  if (ch.status === "open") return now >= ch.terms.start ? "expired" : "open";
  if (now < ch.terms.start) return "upcoming";
  if (now <= ch.terms.end) return "live";
  if (now <= closesAt(ch)) return "closing";
  return "done";
}
export const STATUS_LABEL = { open: "Waiting for an answer", expired: "Expired", declined: "Declined", withdrawn: "Withdrawn",
  upcoming: "Accepted", live: "Live now", closing: "Final catches", done: "Finished", vetoed: "Vetoed" };
/* Still to be decided: points staked here are spoken for. */
export const pending = (ch, now = Date.now()) => ["open", "upcoming", "live", "closing"].includes(challengeStatus(ch, now));

/* The catches that count for one angler: caught during it, sent before final catches close, the right species,
   not disqualified and not a past catch. Every catch has its photo, so photos are always there. */
export function sideCatches(ch, catches, u) {
  const t = ch.terms, sp = t.species || [];
  return catches.filter(c => c.uid === u && !c.dq && !(c.pastStored ?? c.past)
    && c.caughtAt >= t.start && c.caughtAt <= t.end && (c.createdAt || c.caughtAt) <= closesAt(ch)
    && (!sp.length || sp.includes(c.species)));
}

/* One angler's score: { score, fish: the catches that made it, count: fish logged (a stringer counts as its fish) }.
   A stringer has no size for each fish, so it only counts for most fish. */
export function sideScore(t, list) {
  const singles = list.filter(c => !isStringer(c));
  const count = list.reduce((n, c) => n + fishIn(c), 0);
  if (t.win === "most") return { score: count, fish: list, count };
  if (t.win === "bag") {
    const fish = singles.filter(c => c.weightOz > 0).sort((a, b) => b.weightOz - a.weightOz || a.caughtAt - b.caughtAt).slice(0, Math.max(1, t.bagSize || 1));
    return { score: Math.round(fish.reduce((s, c) => s + c.weightOz, 0) * 10) / 10, fish, count };
  }
  const f = t.win === "longest" ? "lengthIn" : "weightOz";
  const best = singles.filter(c => c[f] > 0).reduce((a, b) => (!a || b[f] > a[f] ? b : a), null);
  return { score: best ? best[f] : 0, fish: best ? [best] : [], count };
}

/* Both sides and the result: { sides: [{ uid, score, fish, count, fished }] (challenger first), winner, loser, tie }.
   A higher score wins; the same score (including nothing each) is a tie. `fished`: logged at least one fish that counts. */
export function challengeBoard(ch, catches) {
  const sides = [ch.from, ch.to].map(u => {
    const s = sideScore(ch.terms, sideCatches(ch, catches, u));
    return { uid: u, ...s, fished: s.count > 0 };
  });
  const [a, b] = sides;
  if (a.score === b.score) return { sides, winner: null, loser: null, tie: true };
  const [w, l] = a.score > b.score ? [a, b] : [b, a];
  return { sides, winner: w.uid, loser: l.uid, tie: false };
}

/* Ranking points from finished challenges: { uid, at, pts, kind: "h2h", label }, dated at the end. `v(at)` gives the
   scoring values in effect at a time. Taking part (at least one fish) earns h2hPts, the winner gets h2hWinPts, and the
   staked points go from the loser to the winner. A tie: no winner, so no bonus and nothing moves. A vetoed challenge
   earns nothing. */
export function h2hPointEvents(challenges, catches, v, name, now = Date.now()) {
  const out = [];
  for (const ch of challenges) {
    if (challengeStatus(ch, now) !== "done") continue;
    const at = ch.terms.end, vals = v(at), r = challengeBoard(ch, catches);
    const vs = u => `head-to-head with ${name(otherSide(ch, u))}`;
    for (const s of r.sides) if (s.fished && vals.h2hPts) out.push({ uid: s.uid, at, pts: vals.h2hPts, kind: "h2h", label: `Fished a ${vs(s.uid)}` });
    if (r.tie) continue;
    if (vals.h2hWinPts) out.push({ uid: r.winner, at, pts: vals.h2hWinPts, kind: "h2h", label: `Won a ${vs(r.winner)}` });
    const stake = ch.terms.stake || 0;
    if (stake) {
      out.push({ uid: r.winner, at, pts: stake, kind: "h2h", label: `Won ${stake} staked points from ${name(r.loser)}` });
      out.push({ uid: r.loser, at, pts: -stake, kind: "h2h", label: `Lost ${stake} staked points to ${name(r.winner)}` });
    }
  }
  return out;
}

/* Points an angler can still stake: their points less what's staked in their other challenges still to be decided
   (open offers included), capped by the league's maximum. Never below 0. */
export function stakeRoom(u, points, challenges, maxStake, { except = null, now = Date.now() } = {}) {
  const held = challenges.filter(ch => ch.id !== except && involves(ch, u) && pending(ch, now))
    .reduce((n, ch) => n + (ch.terms.stake || 0), 0);
  return Math.max(0, Math.min(Math.floor(maxStake || 0), Math.floor(points - held)));
}

/* Why these terms can't be offered, or "" if they can. */
export function termsProblem(t, now = Date.now()) {
  if (!WIN[t.win]) return "Pick how it's won.";
  if (t.win === "bag" && !(Number.isInteger(t.bagSize) && t.bagSize >= 2 && t.bagSize <= 10)) return "The number of top fish has to be 2 to 10.";
  if ((t.species || []).length > 10) return "Pick up to 10 species, or any species.";
  if (!isFinite(t.start) || !isFinite(t.end)) return "Set when it starts and ends.";
  if (t.start <= now) return "It has to start in the future, so there's time to accept it.";
  if (t.end <= t.start) return "It has to end after it starts.";
  if (t.end - t.start > MAX_DAYS * 24 * HOUR) return `A challenge can run for up to ${MAX_DAYS} days.`;
  if (!(Number.isInteger(t.stake) && t.stake >= 0)) return "Points staked have to be a whole number.";
  return "";
}

/* What a counter changed, in words ("Ends Sunday 6 PM → Monday 8 AM" is left to the screen): the changed term keys. */
export function changedTerms(a, b) {
  const same = (x, y) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
  return ["win", "bagSize", "species", "start", "end", "stake", "money", "note"].filter(k => !same(a[k], b[k]));
}

/* Words for the screens, the feed and the bell. */
export function termsShort(t) {
  const sp = t.species && t.species.length ? t.species.join(", ") : "any species";
  return `${t.win === "bag" ? `Best ${t.bagSize} fish` : WIN[t.win].short} · ${sp}`;
}
export function scoreText(t, score) {
  if (t.win === "most") return `${score} fish`;
  if (t.win === "longest") return fmtLength(score) || "–";
  return fmtWeight(score) || "–";
}
export function stakesText(t) {
  return [t.stake ? `${t.stake} ${t.stake === 1 ? "point" : "points"}` : "", t.money || ""].filter(Boolean).join(" + ") || "Bragging rights";
}
