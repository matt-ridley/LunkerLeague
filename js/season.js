/* Seasons: a season is the calendar year, and points, titles and places start again every January 1. 2026 (the year
   the league started) is the Preseason: it counts, but unofficially, so it never gives a best title or best finish.
   Season 1 is 2027. Pure functions on plain data. */
import { rankEvents, rankTable, TITLES } from "./rank.js";

import { FIRST_SEASON } from "./config.js";
export { FIRST_SEASON };

export const seasonOf = ms => new Date(ms).getFullYear();
export const seasonRange = year => ({ from: new Date(year, 0, 1).getTime(), to: new Date(year, 11, 31, 23, 59, 59, 999).getTime() });
export const isPreseason = year => year < FIRST_SEASON;
export const seasonNumber = year => year - FIRST_SEASON + 1;
/* "2026 Preseason", "2027 Season" */
export const seasonName = year => `${year} ${isPreseason(year) ? "Preseason" : "Season"}`;
/* "the 2026 Preseason", "Season 1 (2027)" */
export const seasonLong = year => (isPreseason(year) ? `the ${year} Preseason` : `Season ${seasonNumber(year)} (${year})`);
/* 1st, 2nd, 3rd, 4th, 11th, 21st */
export const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
export const seasonOver = (year, now = Date.now()) => now > seasonRange(year).to;

/* The seasons there is something to show for, newest first: from the year of the first league catch to this year. */
export function seasonYears(catches, now = Date.now()) {
  const thisYear = seasonOf(now);
  const first = catches.filter(c => !c.past).reduce((m, c) => Math.min(m, c.caughtAt), Infinity);
  const start = isFinite(first) ? Math.min(seasonOf(first), thisYear) : thisYear;
  const out = [];
  for (let y = thisYear; y >= start; y--) out.push(y);
  return out;
}

/* Every season's table from one pass over the points: { years: Map(year -> ranked rows), career: ranked rows }.
   Each event counts in the season it happened in. Record and crown points (held right now) count in the current
   season only, so a finished season counts what was earned during it. Career adds every season together. */
export function seasonTables(input, now = input.now ?? Date.now()) {
  const events = rankEvents({ ...input, now });
  const buckets = new Map();
  for (const e of events) {
    const y = seasonOf(e.at);
    if (!buckets.has(y)) buckets.set(y, []);
    buckets.get(y).push(e);
  }
  const years = new Map();
  for (const y of new Set([...buckets.keys(), seasonOf(now)])) years.set(y, rankTable(buckets.get(y) || [], input));
  return { years, career: rankTable(events, input) };
}

/* This season's table (the Leaders, the Fish Finder, profiles and the Dock). */
export const thisSeason = (input, now = input.now ?? Date.now()) => seasonTables(input, now).years.get(seasonOf(now));

/* An angler's best official season title and best finished place, each with its (first) year:
   { title: { name, year } | null, finish: { place, of, year } | null }. The Preseason doesn't count, and a place only
   counts once its season is over. */
export function careerBest(tables, uid, now = Date.now()) {
  let title = null, finish = null;
  for (const [year, rows] of [...tables.years].sort((a, b) => a[0] - b[0])) {
    if (isPreseason(year)) continue;
    const i = rows.findIndex(r => r.uid === uid), r = rows[i];
    if (!r || !(r.points > 0)) continue;
    if (!title || TITLES.indexOf(r.title) > TITLES.indexOf(title.name)) title = { name: r.title, year };
    if (seasonOver(year, now) && (!finish || i + 1 < finish.place)) finish = { place: i + 1, of: rows.length, year };
  }
  return { title, finish };
}

/* The Champions wall: every finished season's top 3 (with points), newest first:
   [{ year, preseason, podium: [{ uid, points }] }]. */
export function seasonChampions(tables, now = Date.now()) {
  return [...tables.years].filter(([y]) => seasonOver(y, now)).sort((a, b) => b[0] - a[0])
    .map(([year, rows]) => ({ year, preseason: isPreseason(year), podium: rows.filter(r => r.points > 0).slice(0, 3).map(r => ({ uid: r.uid, points: r.points })) }))
    .filter(s => s.podium.length);
}

/* The Official Pot Lickers: every angler who logged a fish in the Preseason (league catches, not disqualified), in
   the order of their first fish: [{ uid, at }]. One time only: the list closes when the Preseason ends. */
export function potLickers(catches) {
  const first = new Map();
  for (const c of catches) {
    if (c.dq || c.past || !isPreseason(seasonOf(c.caughtAt))) continue;
    if (!first.has(c.uid) || c.caughtAt < first.get(c.uid)) first.set(c.uid, c.caughtAt);
  }
  return [...first].map(([uid, at]) => ({ uid, at })).sort((a, b) => a.at - b.at || a.uid.localeCompare(b.uid));
}
