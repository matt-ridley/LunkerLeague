/* Angler of the Month: a race inside each season. Each calendar month has its own board: the season points earned
   that month (catches, limits, species, badges, derbies, head-to-heads and no-shows; records and crowns are worth
   points for holding them, not on a date, so they don't count here). A month stays provisional for the late-logging
   days, like a season, then locks, and the first admin's phone online saves it for good (months/{YYYY-MM}). Only
   saved months have a winner, so a win can't be rewritten later, and the prizes (bonus points, the badge and the
   Monthly Master crown) come from the saved months. A month needs at least 3 anglers with a catch to have a winner.
   Months start in November 2026, as a Preseason trial.
   Dates and saved months here; the race itself (which needs the points) is in monthrace.js.
   Pure functions on plain data. */

export const FIRST_MONTH = "2026-11";
export const MIN_ANGLERS = 3;
export const BOARD_SIZE = 10;
const DAY = 24 * 3600 * 1000;
const asMap = x => (x instanceof Map ? x : new Map((x || []).map(d => [d.id, d])));
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const pad = n => String(n).padStart(2, "0");
/* "2026-11" for a time. */
export const monthKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const parts = key => { const [y, m] = key.split("-").map(Number); return { y, m: m - 1 }; };
/* The month's first and last moments (local time). */
export function monthRange(key) {
  const { y, m } = parts(key);
  return { from: new Date(y, m, 1).getTime(), to: new Date(y, m + 1, 1).getTime() - 1 };
}
export const monthName = key => { const { y, m } = parts(key); return `${MONTHS[m]} ${y}`; };
export const monthShort = key => MONTHS[parts(key).m];
export const yearOfMonth = key => parts(key).y;
/* The month after this one. */
export const nextMonth = key => monthKey(monthRange(key).to + 1);

/* When a month locks: the start of the next month plus the late-logging days. */
export const monthLockAt = (key, graceDays = 7) => monthRange(key).to + 1 + graceDays * DAY;
/* "live" (still being fished), "provisional" (over, waiting for late catches) or "locked". */
export function monthState(key, now = Date.now(), graceDays = 7) {
  if (now <= monthRange(key).to) return "live";
  return now < monthLockAt(key, graceDays) ? "provisional" : "locked";
}
/* Days left in a live month (counting today). */
export const daysLeft = (key, now = Date.now()) => Math.max(0, Math.ceil((monthRange(key).to - now) / DAY));

/* Every month there is a race for, newest first: from November 2026 to this month. */
export function monthKeys(now = Date.now()) {
  const out = [], last = monthKey(now);
  if (last < FIRST_MONTH) return out;
  for (let k = FIRST_MONTH; k <= last; k = nextMonth(k)) out.unshift(k);
  return out;
}

/* The months that have locked and need saving: oldest first. `docs`: Map(key -> saved month). */
export const monthsToLock = (docs, now = Date.now(), graceDays = 7) =>
  monthKeys(now).filter(k => !docs.has(k) && monthState(k, now, graceDays) === "locked").reverse();

/* Every saved win: [{ key, uid, at, points }] oldest first; `at` is the month's last moment, so a win counts in the
   season (and for the points) of the month it was won in. */
export function monthWins(docs) {
  return [...asMap(docs).values()].filter(d => d.winner && d.key >= FIRST_MONTH)
    .map(d => ({ key: d.key, uid: d.winner, at: monthRange(d.key).to, points: d.points || 0 }))
    .sort((a, b) => a.at - b.at);
}

/* How many months an angler has won (all seasons). */
export const winsOf = (uid, docs) => monthWins(docs).filter(w => w.uid === uid).length;
