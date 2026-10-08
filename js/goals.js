/* Personal goals (goals/{id}), like "10 species this year" or "a 40-inch muskie". Everyone in the league can see them;
   progress is worked out from the catches every time (nothing is stored), and reaching one is news. No points.
   A goal: { id, uid, kind, target, species, field, value, from, to, createdAt }.
   - species / fish / days: reach `target` different species, fish, or days out (days with a fish, plus skunks).
   - size: a `species` with `field` (weightOz or lengthIn) of at least `value`.
   - pb: beat your best `species` `field` from before the goal's period.
   Counts your catches (past logbook ones too, but not disqualified ones) caught between `from` and `to`.
   Pure functions on plain objects. */
import { fishIn, isStringer } from "./stats.js";
import { daysOut, dayAt } from "./skunks.js";
import { fmtWeight, fmtLength, fmtDay } from "./ui.js";

export const KINDS = [
  ["species", "Different species"], ["fish", "Number of fish"], ["days", "Days out"],
  ["size", "A fish of a size"], ["pb", "Beat my personal best"],
];
export const COUNT_KINDS = ["species", "fish", "days"];
const UNIT = { species: ["species", "species"], fish: ["fish", "fish"], days: ["day out", "days out"] };

/* The calendar year containing `ms`, as a goal period. */
export function yearPeriod(ms = Date.now()) {
  const y = new Date(ms).getFullYear();
  return { from: new Date(y, 0, 1).getTime(), to: new Date(y, 11, 31, 23, 59, 59, 999).getTime() };
}
const isYear = g => { const p = yearPeriod(g.from); return p.from === g.from && p.to === g.to; };
export const periodText = g => (isYear(g) ? `in ${new Date(g.from).getFullYear()}` : `${fmtDay(g.from)} to ${fmtDay(g.to)}`);

const sizeText = (field, v) => (field === "lengthIn" ? fmtLength(v) : fmtWeight(v));
/* "10 species", "A Muskie of 40\"+", "Beat my Walleye weight PB" */
export function goalTitle(g) {
  if (COUNT_KINDS.includes(g.kind)) return `${g.target} ${UNIT[g.kind][g.target === 1 ? 0 : 1]}`;
  if (g.kind === "size") return `A ${g.species} of ${sizeText(g.field, g.value)}+`;
  return `Beat my ${g.species} ${g.field === "lengthIn" ? "length" : "weight"} PB`;
}

/* Progress: { current, target, done, doneAt, catchId, text, pct }. doneAt is when it was reached (the catch's time). */
export function goalProgress(g, { catches = [], skunks = [], trips = new Map(), rsvps = new Map(), now = Date.now() } = {}) {
  const mine = catches.filter(c => c.uid === g.uid && !c.dq && c.caughtAt >= g.from && c.caughtAt <= g.to)
    .sort((a, b) => a.caughtAt - b.caughtAt);
  const out = (current, target, doneC, doneAt, text) => ({ current, target, done: doneAt != null, doneAt: doneAt ?? null,
    catchId: doneC ? doneC.id : null, text, pct: target ? Math.min(100, Math.round((current / target) * 100)) : 0 });

  if (g.kind === "species" || g.kind === "fish") {
    const seen = new Set(); let n = 0, hit = null;
    for (const c of mine) {
      if (g.kind === "species") { if (seen.has(c.species)) continue; seen.add(c.species); n = seen.size; } else n += fishIn(c);
      if (!hit && n >= g.target) hit = c;
    }
    return out(n, g.target, hit, hit && hit.caughtAt, `${Math.min(n, 99999)} of ${g.target}`);
  }
  if (g.kind === "days") {
    const d = daysOut(g.uid, { catches, skunks, trips, rsvps, from: g.from, to: g.to, now });
    const hitDay = d.days.length >= g.target ? d.days[g.target - 1] : null;
    let doneAt = null, doneC = null;
    if (hitDay) {
      doneC = mine.find(c => dayKeyOf(c.caughtAt) === hitDay.day) || null;
      doneAt = doneC ? doneC.caughtAt : dayAt(hitDay.day);
    }
    return out(d.daysOut, g.target, doneC, doneAt, `${d.daysOut} of ${g.target}`);
  }
  const f = g.field === "lengthIn" ? "lengthIn" : "weightOz";
  const sized = mine.filter(c => c.species === g.species && !isStringer(c) && c[f] > 0);
  const best = sized.reduce((m, c) => Math.max(m, c[f]), 0);
  if (g.kind === "size") {
    const hit = sized.find(c => c[f] >= g.value) || null;
    return out(best, g.value, hit, hit && hit.caughtAt, best ? `Best so far: ${sizeText(f, best)}` : "None yet");
  }
  // pb: beat the best from before the period (with none before, the first one measured is a PB).
  const before = catches.filter(c => c.uid === g.uid && !c.dq && c.species === g.species && !isStringer(c) && c[f] > 0 && c.caughtAt < g.from)
    .reduce((m, c) => Math.max(m, c[f]), 0);
  const hit = sized.find(c => c[f] > before) || null;
  return out(best, before || 0, hit, hit && hit.caughtAt,
    before ? `To beat: ${sizeText(f, before)}${best ? ` · best so far: ${sizeText(f, best)}` : ""}` : "No PB yet: any measured one sets it");
}
const pad = n => String(n).padStart(2, "0");
const dayKeyOf = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/* Goals reached: [{ g, at, catchId }], oldest first. */
export function goalsReached(goals, data) {
  const out = [];
  for (const g of goals) {
    const p = goalProgress(g, data);
    if (p.done) out.push({ g, at: p.doneAt, catchId: p.catchId });
  }
  return out.sort((a, b) => a.at - b.at);
}

/* The goal closest to done for one angler, for the Fish Finder: a counting goal, on now, at least half way. */
export function goalWatch(me, goals, data) {
  const now = data.now ?? Date.now();
  let best = null;
  for (const g of goals) {
    if (g.uid !== me || !COUNT_KINDS.includes(g.kind) || now < g.from || now > g.to) continue;
    const p = goalProgress(g, data);
    if (p.done || p.pct < 50) continue;
    if (!best || p.pct > best.p.pct) best = { g, p };
  }
  if (!best) return null;
  const left = best.g.target - best.p.current;
  return { g: best.g, left, unit: UNIT[best.g.kind][left === 1 ? 0 : 1], p: best.p };
}
