/* Season series (Angler of the Year): a set of derbies with points by finishing place, added up across the season.
   Admins set a series up; derby organisers put their derby in one (the derby's `seriesId`). Worked out from the data
   every time, like the rankings. Pure functions on plain data.
   A series: { id, name, start, end, points: [1st, 2nd, …], showUpPts, bestOf (0 = every derby counts) }. */
import { derbyStatus, standings, closesAt } from "./derby.js";

export const DEFAULT_SERIES = { points: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], showUpPts: 2, bestOf: 0 };
const asMap = x => (x instanceof Map ? x : new Map((x || []).map(d => [d.id, d])));

/* The series' derbies (not cancelled, not test derbies), in date order. */
export function seriesDerbies(s, derbies) {
  return [...asMap(derbies).values()].filter(d => d.seriesId === s.id && !d.cancelled && !d.testing).sort((a, b) => a.start - b.start);
}

/* upcoming → active → final. Final once the end date has passed and every derby in it has finished. */
export function seriesStatus(s, derbies, now = Date.now()) {
  if (now < s.start) return "upcoming";
  const open = seriesDerbies(s, derbies).some(d => derbyStatus(d, now) !== "ended");
  return now > s.end && !open ? "final" : "active";
}
/* When it became final (for the feed): the end date, or when its last derby finished if that was later. */
export const seriesFinalAt = (s, derbies) => Math.max(s.end, ...seriesDerbies(s, derbies).map(closesAt));

/* Standings from the finished derbies: [{ uid, total, gross, wins, bestPlace, results: [{ d, place, pts, counted }] }], best
   first. Each derby gives points for the place on its main board, plus show-up points to everyone who joined (with or
   without a fish). With bestOf, only an angler's best that many derbies count in `total` (`gross` counts them all).
   Ties: more wins, then a bigger gross, then a better best place, then whoever got there first. */
export function seriesStandings(s, { derbies, catches, entrants = new Map() }, now = Date.now()) {
  const points = s.points && s.points.length ? s.points : DEFAULT_SERIES.points, showUp = s.showUpPts ?? DEFAULT_SERIES.showUpPts;
  const by = new Map(), at = new Map();
  for (const d of seriesDerbies(s, derbies)) {
    if (derbyStatus(d, now) !== "ended") continue;
    const ent = entrants.get(d.id) || new Map(), rows = standings(d, catches, ent);
    const place = new Map(rows.map((r, i) => [r.uid, i + 1]));
    for (const uid of new Set([...ent.keys(), ...place.keys()])) {
      const p = place.get(uid) || null;
      const pts = (p && p <= points.length ? points[p - 1] : 0) + (ent.has(uid) ? showUp : 0);
      if (!by.has(uid)) by.set(uid, []);
      by.get(uid).push({ d, place: p, pts, counted: true });
      if (!at.has(uid)) at.set(uid, closesAt(d));
    }
  }
  const rows = [...by].map(([uid, results]) => {
    if (s.bestOf > 0 && results.length > s.bestOf) {
      const keep = new Set([...results].sort((a, b) => b.pts - a.pts || a.d.start - b.d.start).slice(0, s.bestOf));
      for (const r of results) r.counted = keep.has(r);
    }
    const places = results.map(r => r.place).filter(Boolean);
    return {
      uid, results, total: results.filter(r => r.counted).reduce((n, r) => n + r.pts, 0), gross: results.reduce((n, r) => n + r.pts, 0),
      wins: places.filter(p => p === 1).length, bestPlace: places.length ? Math.min(...places) : Infinity,
    };
  });
  return rows.sort((a, b) => b.total - a.total || b.wins - a.wins || b.gross - a.gross || a.bestPlace - b.bestPlace || at.get(a.uid) - at.get(b.uid));
}
