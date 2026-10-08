/* Bets: any number of anglers bet on something, and the app works out who won and who gets what. Never league points:
   stakes are an optional buy-in in dollars (the pot) and/or a prize in words. Pure functions on plain data.
   Times are epoch milliseconds.

   A bet: { id, title, organiserUid, kind: "contest", rule, open, invited: [uid], start, end, buyIn, roundTo, prize, note,
   createdAt, cancelled }
   - rule: { win: "heaviest" | "longest" | "most" | "first" | "called", species: [], minWeightOz, minLengthIn }. "called": the
     organiser decides (anything the catches can't settle, like "first boat to the launch"), from proof photos.
   - result (called bets, once the organiser settles it): { winners: [uid], wash, at, by }
   - open: anyone can join until it starts; otherwise only the organiser and the anglers invited.
   Players: Map(uid -> { at, in }); `in: false` is an invite turned down. */
import { isStringer, fishIn } from "./stats.js";
import { roundAmt } from "./payout.js";
import { fmtWeight, fmtLength } from "./ui.js";

export const RULES = {
  heaviest: { label: "Biggest fish by weight" },
  longest: { label: "Biggest fish by length" },
  most: { label: "Most fish" },
  first: { label: "First to catch one" },
  called: { label: "The organiser decides (with proof photos)" },
};
export const isCalled = b => b.rule.win === "called";
export const LATE_HOURS = 12; // catches made during it can still sync this long after (no-signal spots)
export const MAX_DAYS = 366;
const HOUR = 3600 * 1000;

export const playersIn = players => [...(players || new Map())].filter(([, p]) => p.in !== false).map(([u]) => u);
export const canJoin = (b, u) => b.open || b.organiserUid === u || (b.invited || []).includes(u);

/* Does a catch qualify: the right species, and big enough for a "first to catch" bet. */
function qualifies(b, c) {
  const r = b.rule, sp = r.species || [];
  if (sp.length && !sp.includes(c.species)) return false;
  if (r.win !== "first") return true;
  if (isStringer(c)) return !(r.minWeightOz > 0) && !(r.minLengthIn > 0);
  return (!(r.minWeightOz > 0) || c.weightOz >= r.minWeightOz) && (!(r.minLengthIn > 0) || c.lengthIn >= r.minLengthIn);
}

/* The catches that count for the players: caught during the bet, sent within the late window, not disqualified or past. */
export function betCatches(b, catches, players) {
  const who = new Set(playersIn(players)), close = b.end + LATE_HOURS * HOUR;
  return catches.filter(c => who.has(c.uid) && !c.dq && !(c.pastStored ?? c.past) && c.caughtAt >= b.start && c.caughtAt <= b.end
    && (c.createdAt || c.caughtAt) <= close && qualifies(b, c)).sort((a, b2) => a.caughtAt - b2.caughtAt);
}

/* The first qualifying catch of a "first to catch" bet, or null. Ties (the same minute) all win. */
const firstCatches = (b, list) => list.length ? list.filter(c => c.caughtAt === list[0].caughtAt) : [];

/* When the result can't change any more: the late window after the end, or for "first to catch", after the first
   catch (an earlier one could still sync from a no-signal spot until then). */
export function finalAt(b, catches, players) {
  if (isCalled(b)) return b.result ? b.result.at : Infinity;
  if (b.rule.win === "first") {
    const f = firstCatches(b, betCatches(b, catches, players))[0];
    if (f) return Math.min(f.caughtAt, b.end) + LATE_HOURS * HOUR;
  }
  return b.end + LATE_HOURS * HOUR;
}

/* open (joining) → live → closing (late catches syncing) → done; or cancelled, or off (fewer than 2 joined). A "first to
   catch" bet stops being live once someone has caught one. */
export function betStatus(b, catches, players, now = Date.now()) {
  if (b.cancelled) return "cancelled";
  if (now < b.start) return "open";
  if (playersIn(players).length < 2) return "off";
  // The organiser settles it whenever they can (even before the end, e.g. once someone's at the launch).
  if (isCalled(b)) return b.result ? "done" : now <= b.end ? "live" : "deciding";
  const fin = finalAt(b, catches, players);
  if (now >= fin) return "done";
  const caught = b.rule.win === "first" && betCatches(b, catches, players).length > 0;
  return now <= b.end && !caught ? "live" : "closing";
}
export const STATUS_LABEL = { open: "Open to join", live: "Live now", closing: "Final catches", deciding: "Waiting for the organiser",
  done: "Finished", cancelled: "Cancelled", off: "Called off" };

/* Every player's score, best first: [{ uid, score, fish, count }]. For "first to catch", score is 1 for whoever got
   there first. A stringer has no size for each fish, so it only counts for most fish (and a plain "first to catch"). */
export function betBoard(b, catches, players) {
  const list = betCatches(b, catches, players), rows = [];
  const firsts = b.rule.win === "first" ? new Set(firstCatches(b, list).map(c => c.uid)) : null;
  for (const u of playersIn(players)) {
    const mine = list.filter(c => c.uid === u), count = mine.reduce((n, c) => n + fishIn(c), 0);
    let score = 0, fish = [];
    if (b.rule.win === "most") { score = count; fish = mine; }
    else if (b.rule.win === "first") { fish = firsts.has(u) ? [mine[0]] : []; score = fish.length; }
    else {
      const f = b.rule.win === "longest" ? "lengthIn" : "weightOz";
      const best = mine.filter(c => !isStringer(c) && c[f] > 0).reduce((a, c) => (!a || c[f] > a[f] ? c : a), null);
      if (best) { score = best[f]; fish = [best]; }
    }
    rows.push({ uid: u, score, fish, count });
  }
  // Ties on the board go to whoever got there first.
  const reached = r => (r.fish.length ? Math.max(...r.fish.map(c => c.caughtAt)) : Infinity);
  return rows.sort((a, c) => c.score - a.score || reached(a) - reached(c));
}

/* The result: { winners: [uid], wash, pot, shares: Map(uid -> dollars) }. The top score wins and a tie shares it. Nobody
   scoring is a wash: no winner, nothing owed. Shares are rounded the organiser's way, the difference going to (or
   coming off) the first winner on the board. */
export function betResult(b, catches, players) {
  const pot = Math.round((b.buyIn || 0) * playersIn(players).length * 100) / 100;
  if (isCalled(b)) {
    // The organiser's call, kept to anglers who are in it (in the order they were picked).
    const ins = new Set(playersIn(players)), winners = ((b.result && b.result.winners) || []).filter(u => ins.has(u));
    const rows = playersIn(players).map(u => ({ uid: u, score: winners.includes(u) ? 1 : 0, fish: [], count: 0 }))
      .sort((a, c) => c.score - a.score);
    if (!winners.length) return { winners: [], wash: true, pot, shares: new Map(), rows };
    return { winners, wash: false, pot, shares: splitPot(pot, winners, b.roundTo || 0), rows };
  }
  const rows = betBoard(b, catches, players), top = rows[0];
  if (!top || !(top.score > 0)) return { winners: [], wash: true, pot, shares: new Map(), rows };
  const winners = rows.filter(r => r.score === top.score).map(r => r.uid);
  return { winners, wash: false, pot, shares: splitPot(pot, winners, b.roundTo || 0), rows };
}
export function splitPot(pot, winners, roundTo = 0) {
  const shares = new Map();
  if (!pot || !winners.length) return shares;
  const each = roundAmt(pot / winners.length, roundTo);
  winners.forEach(u => shares.set(u, each));
  const diff = Math.round((pot - each * winners.length) * 100) / 100;
  if (diff) shares.set(winners[0], Math.round((each + diff) * 100) / 100);
  return shares;
}

/* Why these settings can't be saved, or "" if they can. `editing`: the start may stay where it was. */
export function betProblem(b, now = Date.now(), editing = false) {
  if (!String(b.title || "").trim()) return "Give the bet a name.";
  if (!RULES[b.rule.win]) return "Pick how it's won.";
  if ((b.rule.species || []).length > 10) return "Pick up to 10 species, or any species.";
  if (isCalled(b) && !String(b.note || "").trim()) return "Say what wins in the details, so everyone knows what the proof has to show.";
  if (!isFinite(b.start) || !isFinite(b.end)) return "Set when it starts and ends.";
  if (!editing && b.start <= now) return "It has to start in the future, so people can join first.";
  if (b.end <= b.start) return "It has to end after it starts.";
  if (b.end - b.start > MAX_DAYS * 24 * HOUR) return "A bet can run for up to a year.";
  if (!b.open && !(b.invited || []).length) return "Invite at least one angler, or make it open to anyone.";
  if (!(b.buyIn >= 0)) return "The buy-in can't be negative.";
  return "";
}

/* Words for the screens, the feed and the bell. */
export function ruleText(r) {
  if (r.win === "called") return "The organiser decides, from proof photos";
  const sp = r.species && r.species.length ? r.species.join(", ") : r.win === "first" ? "any fish" : "any species";
  if (r.win !== "first") return `${RULES[r.win].label} · ${sp}`;
  const size = [r.minWeightOz > 0 ? `${fmtWeight(r.minWeightOz)}+` : "", r.minLengthIn > 0 ? `${fmtLength(r.minLengthIn)}+` : ""].filter(Boolean).join(", ");
  return `First to catch ${size ? `a ${size} ` : "a "}${r.species && r.species.length ? r.species.join(" or ") : "fish"}`;
}
export function betScoreText(r, score) {
  if (r.win === "most") return `${score} fish`;
  if (r.win === "first") return score ? "First!" : "–";
  if (r.win === "longest") return fmtLength(score) || "–";
  return fmtWeight(score) || "–";
}
