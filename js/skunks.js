/* Skunks: days out with no fish. Logged by the angler ("Got skunked", one per day, saved as skunks/{uid}_{day}), or
   worked out from outings: an angler who said "In" to an outing that's over, and logged no fish during it, was skunked
   that day. A day with a fish is never a skunk. Pure functions on plain data. */
import { fishIn } from "./stats.js";
import { outingEnd } from "./outings.js";

const pad = n => String(n).padStart(2, "0");
/* A local calendar day as "YYYY-MM-DD". */
export const dayKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
/* Noon on that day, local time (for sorting and periods). */
export const dayAt = key => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d, 12).getTime(); };
export const skunkId = (uid, day) => `${uid}_${day}`;
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/* The days an angler said "In" to an outing that's over and logged no fish during it. */
export function outingSkunkDays(uid, catches, trips = new Map(), rsvps = new Map(), now = Date.now()) {
  const days = new Set();
  for (const t of trips.values()) {
    const r = (rsvps.get(t.id) || new Map()).get(uid);
    if (!r || r.answer !== "in" || now <= outingEnd(t) || t.at > now) continue;
    const end = outingEnd(t);
    if (!catches.some(c => c.uid === uid && !c.dq && c.caughtAt >= t.at && c.caughtAt <= end)) days.add(dayKey(t.at));
  }
  return days;
}

/* Days out for an angler between `from` and `to` (ms, inclusive): days with a fish, plus skunk days (logged or from
   outings) with no fish. { days: [{ day, fish, skunk, logged }] oldest first, daysOut, skunkDays, fish, fishPerDay,
   longestStreak, currentStreak }. Streaks are skunk days in a row among days out (days at home don't break them). */
export function daysOut(uid, { catches = [], skunks = [], trips = new Map(), rsvps = new Map(), from = 0, to = Infinity, now = Date.now() } = {}) {
  const inRange = key => { const at = dayAt(key); return at >= from - 12 * 3600000 && at <= to + 12 * 3600000; };
  const byDay = new Map();
  for (const c of catches) {
    if (c.uid !== uid || c.dq || c.caughtAt < from || c.caughtAt > to) continue;
    const k = dayKey(c.caughtAt);
    byDay.set(k, (byDay.get(k) || 0) + fishIn(c));
  }
  const logged = new Set(skunks.filter(s => s.uid === uid && DAY_RE.test(s.day)).map(s => s.day));
  const fromOutings = outingSkunkDays(uid, catches, trips, rsvps, now);
  const keys = new Set([...byDay.keys(), ...[...logged, ...fromOutings].filter(inRange)]);
  const days = [...keys].sort().map(day => {
    const fish = byDay.get(day) || 0;
    return { day, fish, skunk: fish === 0, logged: logged.has(day) };
  });
  let longest = 0, run = 0;
  for (const d of days) { run = d.skunk ? run + 1 : 0; longest = Math.max(longest, run); }
  const fish = days.reduce((n, d) => n + d.fish, 0);
  return {
    days, daysOut: days.length, skunkDays: days.filter(d => d.skunk).length, fish,
    fishPerDay: days.length ? Math.round((fish / days.length) * 10) / 10 : 0,
    longestStreak: longest, currentStreak: run,
  };
}
