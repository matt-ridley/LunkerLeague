// Unit tests for angler rankings and versioned scoring. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SCORING, scoringTimeline, scoringAt, rankings, rankEvents, titleFor, badgesFor } from "../js/rank.js";
import { DEFAULTS } from "../js/derby.js";

const H = 3600e3, DAY = 24 * H;
const T0 = new Date(2026, 4, 1, 8).getTime(); // 2026-May-01 8 AM
let n = 0;
const fish = (uid, species, weightOz, t, extra = {}) => ({ id: "c" + ++n, uid, species, weightOz, lengthIn: null, caughtAt: t, ...extra });
const total = (rows, uid) => (rows.find(r => r.uid === uid) || { points: 0 }).points;

test("catch points have a daily cap; first catch of each species scores once", () => {
  const catches = [1, 2, 3, 4, 5].map(i => fish("amy", "Perch", 5 + i, T0 + i * 60e3));   // 5 perch in one day
  catches.push(fish("amy", "Perch", 6, T0 + DAY));                                       // next day
  const ev = rankEvents({ catches, derbies: [], entrants: new Map(), versions: [], now: T0 + 2 * DAY });
  assert.equal(ev.filter(e => e.kind === "catch").length, 4);                            // 3 capped + 1
  assert.equal(ev.filter(e => e.kind === "species").length, 1);
});

test("record points go to the current top 3 on each weight board", () => {
  const catches = [fish("amy", "Walleye", 90, T0), fish("bo", "Walleye", 80, T0), fish("cy", "Walleye", 70, T0), fish("di", "Walleye", 60, T0)];
  const rows = rankings({ catches, derbies: [], entrants: new Map(), versions: [], members: ["amy", "bo", "cy", "di"], now: T0 + DAY });
  // each: 1 catch + 3 species, plus 5/3/1/0 for the board
  assert.deepEqual(["amy", "bo", "cy", "di"].map(u => total(rows, u)), [9, 7, 5, 4]);
  assert.deepEqual(rows.map(r => r.uid), ["amy", "bo", "cy", "di"]);
});

test("finished derbies score places, joining and anglers beaten; test derbies and DQs don't count", () => {
  const d = { ...DEFAULTS, id: "d1", name: "Spring Derby", start: T0 - H, end: T0 + H, syncGraceHours: 0 };
  const t = { ...d, id: "t1", name: "Practice", testing: true };
  const catches = [fish("amy", "Bass", 50, T0, { derbyId: "d1" }), fish("bo", "Bass", 40, T0, { derbyId: "d1" }),
    fish("cy", "Bass", 99, T0, { derbyId: "d1", dq: true }), fish("amy", "Bass", 10, T0, { derbyId: "t1" })];
  const entrants = new Map([["d1", new Map([["amy", {}], ["bo", {}], ["cy", {}]])], ["t1", new Map([["amy", {}]])]]);
  const versions = [{ id: "v1", mode: "retro", createdAt: 1, values: { beatPts: 1 } }];
  const ev = rankEvents({ catches, derbies: [d, t], entrants, versions, now: T0 + 2 * H }).filter(e => e.kind === "derby");
  const sum = u => ev.filter(e => e.uid === u).reduce((s, e) => s + e.pts, 0);
  assert.equal(sum("amy"), 2 + 25 + 2);   // joined, won, beat 2
  assert.equal(sum("bo"), 2 + 15 + 1);
  assert.equal(sum("cy"), 2);             // disqualified fish: joined only
  assert.ok(!ev.some(e => e.label.includes("Practice")));
});

test("versions: 'from now on' keeps older events on old values; 'all history' rescores everything", () => {
  const catches = [fish("amy", "Pike", 100, T0), fish("amy", "Pike", 90, T0 + 10 * DAY)];
  const base = { catches, derbies: [], entrants: new Map(), members: ["amy"], now: T0 + 20 * DAY };
  const noRecords = { recordPts: [0, 0, 0] };
  const v1 = { id: "v1", mode: "retro", createdAt: 1, values: { ...noRecords } };                                       // 1/catch, 3/species
  const v2 = { id: "v2", mode: "forward", createdAt: 2, effectiveFrom: T0 + 5 * DAY, values: { ...noRecords, catchPts: 10 } };
  const v3 = { id: "v3", mode: "retro", createdAt: 3, values: { ...noRecords, catchPts: 2, speciesPts: 0 } };
  assert.equal(total(rankings({ ...base, versions: [v1] }), "amy"), 1 + 3 + 1);
  assert.equal(total(rankings({ ...base, versions: [v1, v2] }), "amy"), 1 + 3 + 10);       // only the later catch gets 10
  assert.equal(total(rankings({ ...base, versions: [v1, v2, v3] }), "amy"), 2 + 2);        // retro replaces both
  const line = scoringTimeline([v1, v2]);
  assert.equal(scoringAt(line, T0).catchPts, 1);
  assert.equal(scoringAt(line, T0 + 6 * DAY).catchPts, 10);
});

test("a season only counts this year's events (plus current record standings)", () => {
  const old = new Date(2025, 6, 1).getTime(), now = new Date(2026, 6, 1).getTime();
  const catches = [fish("amy", "Carp", 200, old), fish("amy", "Trout", 30, now - DAY)];
  const input = { catches, derbies: [], entrants: new Map(), versions: [], members: ["amy"], now };
  assert.equal(total(rankings(input), "amy"), 1 + 3 + 1 + 3 + 5 + 5);
  assert.equal(total(rankings(input, { since: new Date(2026, 0, 1).getTime() }), "amy"), 1 + 3 + 5 + 5);
});

test("titles and badges", () => {
  assert.equal(titleFor(0), "Bait Bucket");
  assert.equal(titleFor(30), "Dock Dangler");
  assert.equal(titleFor(1000), "Legend of the Lake");
  assert.equal(titleFor(12, { ...DEFAULT_SCORING, titles: [0, 5, 10, 15, 20, 25, 30] }), "Dock Dangler");
  const night = new Date(2026, 4, 1, 22).getTime();
  const catches = [fish("amy", "Catfish", 100, night, { released: true })];
  assert.deepEqual(badgesFor("amy", { catches, derbies: [], entrants: new Map() }).map(b => b.id), ["first", "owl"]);
});
