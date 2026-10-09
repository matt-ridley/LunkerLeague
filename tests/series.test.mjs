// Unit tests for derby series. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { seriesStandings, seriesStatus, seriesDerbies, DEFAULT_SERIES } from "../js/series.js";
import { leagueEvents, alertsFor } from "../js/events.js";
import { DEFAULTS } from "../js/derby.js";

const H = 3600e3, DAY = 24 * H;
const T0 = new Date(2026, 4, 2, 6).getTime();
const NOW = T0 + 60 * DAY;
const S = { id: "s1", name: "2026 Walleye Trail", start: T0 - DAY, end: T0 + 30 * DAY, ...DEFAULT_SERIES };
const derby = (id, week, extra = {}) => ({ ...DEFAULTS, id, name: `Derby ${id}`, start: T0 + week * 7 * DAY, end: T0 + week * 7 * DAY + 10 * H, syncGraceHours: 0, seriesId: "s1", ...extra });
let n = 0;
const fish = (uid, d, weightOz) => ({ id: `c${++n}`, uid, species: "Walleye", weightOz, lengthIn: null, caughtAt: d.start + H, createdAt: d.start + H, derbyId: d.id });
const ents = (...uids) => new Map(uids.map(u => [u, { joinedAt: 1 }]));

const d1 = derby("d1", 0), d2 = derby("d2", 1), d3 = derby("d3", 2);
const derbies = [d1, d2, d3, derby("dx", 1, { testing: true }), derby("dy", 1, { cancelled: true }), derby("dz", 1, { seriesId: "" })];
const catches = [
  fish("amy", d1, 80), fish("bo", d1, 70),             // d1: amy 1st, bo 2nd, cy fished
  fish("bo", d2, 90), fish("amy", d2, 60),             // d2: bo 1st, amy 2nd
  fish("bo", d3, 50),                                  // d3: bo 1st, amy fished
];
const entrants = new Map([["d1", ents("amy", "bo", "cy")], ["d2", ents("amy", "bo")], ["d3", ents("amy", "bo")]]);

test("only the series' real derbies count, in date order", () => {
  assert.deepEqual(seriesDerbies(S, derbies).map(d => d.id), ["d1", "d2", "d3"]);
});

test("points by place plus show-up points; ties go to more wins", () => {
  const rows = seriesStandings(S, { derbies, catches, entrants }, NOW);
  // bo: 18+2, 25+2, 25+2 = 74; amy: 25+2, 18+2, 0+2 = 49; cy: 0+2 = 2
  assert.deepEqual(rows.map(r => [r.uid, r.total, r.wins]), [["bo", 74, 2], ["amy", 49, 1], ["cy", 2, 0]]);
  assert.equal(rows[2].results[0].place, null); // fished, no fish
});

test("best-of counts only each angler's best results", () => {
  const rows = seriesStandings({ ...S, bestOf: 2 }, { derbies, catches, entrants }, NOW);
  const amy = rows.find(r => r.uid === "amy");
  assert.equal(amy.total, 47); // 27 + 20; the 2-point derby is dropped
  assert.deepEqual(amy.results.map(r => r.counted), [true, true, false]);
});

test("unfinished derbies don't count yet; the series is final after its end date once its derbies are done", () => {
  const mid = T0 + 8 * DAY; // d1 and d2 finished, d3 not yet
  assert.equal(seriesStandings(S, { derbies, catches, entrants }, mid).find(r => r.uid === "bo").total, 47);
  assert.equal(seriesStatus(S, derbies, T0 - 2 * DAY), "upcoming");
  assert.equal(seriesStatus(S, derbies, mid), "active");
  assert.equal(seriesStatus(S, derbies, NOW), "final");
  assert.equal(seriesStatus(S, [...derbies, derby("late", 10)], NOW), "active"); // a derby still to come
});

test("the winner is announced in the feed and on their bell", () => {
  const data = { catches, derbies, entrants, series: new Map([["s1", S]]), name: u => u.toUpperCase(), now: NOW };
  const news = leagueEvents(data).find(e => e.id === "series:s1");
  assert.equal(news.text, "BO won the 2026 Walleye Trail series!");
  assert.ok(alertsFor("bo", data).some(a => a.text === "You won the 2026 Walleye Trail series!"));
  assert.equal(leagueEvents({ ...data, series: new Map([["s1", { ...S, name: "2026 Angler of the Year" }]]) })
    .find(e => e.id === "series:s1").text, "BO won 2026 Angler of the Year!");
});

test("a tie on counted points and wins goes to more points over every derby", () => {
  const two = [d1, d2], c = [fish("amy", d1, 80), fish("bo", d1, 70), fish("bo", d2, 95)];
  const ent = new Map([["d1", ents("amy", "bo")], ["d2", ents("amy", "bo")]]);
  // Best 1: amy 27 (d1 win), bo 27 (d2 win). Every derby: bo 47, amy 29, so bo is ahead.
  const rows = seriesStandings({ ...S, bestOf: 1 }, { derbies: two, catches: c, entrants: ent }, NOW);
  assert.deepEqual(rows.map(r => [r.uid, r.total, r.gross]), [["bo", 27, 47], ["amy", 27, 29]]);
});
