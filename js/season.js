/* Seasons: a season is the calendar year, and points, titles and places start again every January 1. 2026 (the year
   the league started) is the Preseason: it counts, but unofficially, so it never gives a best title or best finish.
   Season 1 is 2027. Pure functions on plain data. */
import { rankEvents, rankTable, titleFor, scoringTimeline, currentScoring, TITLES } from "./rank.js";

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

/* The final whistle: a finished season stays provisional for the late-logging days (a fish caught on December 30
   and logged on January 3 still counts for it), then it locks and is saved for good (seasons/{year}). */
const DAY = 24 * 3600 * 1000;
export const lockAt = (year, graceDays = 7) => new Date(year + 1, 0, 1).getTime() + graceDays * DAY;
/* "live" (still being fished), "provisional" (over, waiting for late catches) or "locked". */
export function seasonState(year, now = Date.now(), graceDays = 7) {
  if (!seasonOver(year, now)) return "live";
  return now < lockAt(year, graceDays) ? "provisional" : "locked";
}

/* A finished season's table as it stood when it ended: the points earned during it, plus the record and crown
   points held on December 31 (that season's records and crowns). */
export function finalTable(input, year) {
  const { to } = seasonRange(year);
  const crowns = (input.crownHistory || []).filter(s => s.year === year);
  const events = rankEvents({ ...input, now: to, crowns }).filter(e => seasonOf(e.at) === year);
  return rankTable(events, input);
}

/* A locked season's saved table (seasons/{year}), shaped like the live ones. */
function savedTable(doc) {
  return [...(doc.standings || [])].sort((a, b) => a.place - b.place)
    .map(r => ({ uid: r.uid, points: r.points, title: r.title, byKind: { ...r.byKind }, events: [], saved: true }));
}

/* The seasons there is something to show for, newest first: from the year of the first league catch to this year. */
export function seasonYears(catches, now = Date.now()) {
  const thisYear = seasonOf(now);
  const first = catches.filter(c => !c.past).reduce((m, c) => Math.min(m, c.caughtAt), Infinity);
  const start = isFinite(first) ? Math.min(seasonOf(first), thisYear) : thisYear;
  const out = [];
  for (let y = thisYear; y >= start; y--) out.push(y);
  return out;
}

/* Every season's table: { years: Map(year -> ranked rows), career: ranked rows }. This season is live: each event
   counts in the season it happened in, plus the record and crown points held right now. A finished season is its
   saved table once it's locked (`input.seasonDocs`: Map(year -> seasons/{year} doc)), or worked out as it stood on
   December 31 until then. Career adds every season together. */
export function seasonTables(input, now = input.now ?? Date.now()) {
  const thisYear = seasonOf(now), docs = input.seasonDocs || new Map();
  const events = rankEvents({ ...input, now });
  const pastYears = new Set([...docs.keys()]);
  for (const e of events) { const y = seasonOf(e.at); if (y < thisYear) pastYears.add(y); }
  const years = new Map([[thisYear, rankTable(events.filter(e => seasonOf(e.at) === thisYear), input)]]);
  for (const y of [...pastYears].sort((a, b) => b - a)) years.set(y, docs.has(y) ? savedTable(docs.get(y)) : finalTable(input, y));
  return { years, career: careerTable(years, input) };
}

/* Every season added together: [{ uid, points, byKind, title, events: [] }], highest first. */
function careerTable(years, input) {
  const cur = currentScoring(scoringTimeline(input.versions)), by = new Map();
  for (const rows of years.values()) for (const r of rows) {
    const e = by.get(r.uid) || { uid: r.uid, points: 0, byKind: {}, events: [] };
    e.points += r.points;
    for (const [k, v] of Object.entries(r.byKind || {})) e.byKind[k] = (e.byKind[k] || 0) + v;
    by.set(r.uid, e);
  }
  for (const u of input.members || []) if (!by.has(u)) by.set(u, { uid: u, points: 0, byKind: {}, events: [] });
  return [...by.values()].map(r => ({ ...r, points: Math.round(r.points * 10) / 10, title: titleFor(r.points, cur) }))
    .sort((a, b) => b.points - a.points || a.uid.localeCompare(b.uid));
}

/* The defending champion this season: last season's winner, once it's locked and saved (official seasons only). */
export function defendingChamp(docs, now = Date.now()) {
  const last = seasonOf(now) - 1, doc = docs && docs.get(last);
  return doc && !isPreseason(last) ? doc.champion || null : null;
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

/* An angler's trophy shelf, from the locked seasons (theirs for good), newest first: [{ year, icon, text }]: a
   podium finish, each crown held when the season ended, and each season award won. */
export function trophiesFor(uid, docs, crownName = id => id) {
  const out = [], MEDAL = ["🥇", "🥈", "🥉"];
  for (const d of [...(docs || new Map()).values()].sort((a, b) => b.year - a.year)) {
    const r = (d.standings || []).find(s => s.uid === uid);
    if (r && r.place <= 3 && r.points > 0) out.push({ year: d.year, icon: MEDAL[r.place - 1], text: r.place === 1 ? `${seasonName(d.year)} champion` : `${ordinal(r.place)} in the ${seasonName(d.year)}` });
    for (const c of d.crowns || []) if (c.uid === uid) out.push({ year: d.year, icon: "👑", text: `${crownName(c.id)} · ${d.year}` });
    for (const a of d.awards || []) if (a.uid === uid && !a.boatId) out.push({ year: d.year, icon: a.icon, text: `${a.title} · ${d.year}` });
  }
  return out;
}
