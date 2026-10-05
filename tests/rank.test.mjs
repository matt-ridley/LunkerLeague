// Unit tests for angler rankings and versioned scoring. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SCORING, scoringTimeline, scoringAt, rankings, rankEvents, titleFor, badgesFor } from "../js/rank.js";
import { DEFAULTS } from "../js/derby.js";

const H = 3600e3, DAY = 24 * H;
const T0 = new Date(2026, 4, 1, 8).getTime(); // 2026-May-01 8 AM
let n = 0;
const fish = (uid, species, weightOz, t, extra = {}) => ({ id: "c" + ++n, uid, species, weightOz, lengthIn: null, caughtAt: t, ...extra });
// Points without crowns and badges (they have their own tests), so these tests stay about what they check.
const total = (rows, uid) => { const r = rows.find(r => r.uid === uid); return r ? Math.round((r.points - r.byKind.crown - r.byKind.badge) * 10) / 10 : 0; };

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
  // A 100 oz (6 lb 4 oz) released catfish at 10 PM, the angler's first catch.
  assert.deepEqual(badgesFor("amy", { catches, derbies: [], entrants: new Map(), now: night + DAY }).map(b => b.id).sort(), ["first", "lb5", "owl", "recordSet"]);
  // Still the record 30 days later: Untouchable too.
  assert.ok(badgesFor("amy", { catches, derbies: [], entrants: new Map(), now: night + 31 * DAY }).some(b => b.id === "untouchable"));
});

const stringer = (uid, species, count, limit, t, extra = {}) => fish(uid, species, null, t, { fishCount: count, limit, ...extra });
const kindPts = (ev, kind) => ev.filter(e => e.kind === kind).reduce((s, e) => s + e.pts, 0);
const evFor = catches => rankEvents({ catches, derbies: [], entrants: new Map(), versions: [], now: T0 + 3 * DAY });

test("a stringer fills the day's catch points; a limit adds the bonus once a day", () => {
  assert.equal(kindPts(evFor([stringer("amy", "Yellow Perch", 50, false, T0)]), "catch"), 3);
  const lim = evFor([stringer("amy", "Yellow Perch", 50, true, T0)]);
  assert.equal(kindPts(lim, "catch"), 3);
  assert.equal(kindPts(lim, "limit"), 5);
  // Two singles then a stringer, or a stringer then two singles: the day still totals the cap.
  assert.equal(kindPts(evFor([fish("amy", "Walleye", 30, T0), fish("amy", "Walleye", 30, T0 + 60e3), stringer("amy", "Yellow Perch", 20, false, T0 + 120e3)]), "catch"), 3);
  assert.equal(kindPts(evFor([stringer("amy", "Yellow Perch", 20, false, T0), fish("amy", "Walleye", 30, T0 + 60e3), fish("amy", "Walleye", 30, T0 + 120e3)]), "catch"), 3);
  // Two limits on one day pay once; a limit the next day pays again; other anglers are separate.
  const many = evFor([stringer("amy", "Yellow Perch", 50, true, T0), stringer("amy", "Walleye", 4, true, T0 + H),
    stringer("amy", "Yellow Perch", 50, true, T0 + DAY), stringer("bo", "Yellow Perch", 50, true, T0)]);
  assert.equal(kindPts(many.filter(e => e.uid === "amy"), "limit"), 10);
  assert.equal(kindPts(many.filter(e => e.uid === "amy"), "catch"), 6);
  assert.equal(kindPts(many.filter(e => e.uid === "bo"), "limit"), 5);
});

test("a disqualified stringer scores nothing; the limit bonus follows the scoring versions", () => {
  assert.equal(evFor([stringer("amy", "Yellow Perch", 50, true, T0, { dq: true })]).length, 0);
  const versions = [{ id: "v1", mode: "retro", createdAt: T0 + 2 * DAY, values: { ...DEFAULT_SCORING, limitPts: 10 } }];
  const rows = rankings({ catches: [stringer("amy", "Yellow Perch", 50, true, T0)], derbies: [], entrants: new Map(), versions, members: ["amy"], now: T0 + 3 * DAY });
  assert.equal(rows[0].byKind.limit, 10);
  assert.equal(total(rows, "amy"), 3 + 10 + 3); // catches + limit + first species
});

test("a stringer's fish all count toward badges", () => {
  const ids = badgesFor("amy", { catches: [stringer("amy", "Yellow Perch", 50, true, T0)], derbies: [], entrants: new Map(), now: T0 + DAY }).map(b => b.id);
  assert.ok(ids.includes("first"));
});

test("crowns held right now are worth points, and the points follow the crown", () => {
  const catches = [fish("amy", "Walleye", 80, T0), fish("bo", "Walleye", 90, T0 + H), fish("bo", "Pike", 90, T0 + 2 * H)];
  const rows = rankings({ catches, derbies: [], entrants: new Map(), versions: [], members: ["amy", "bo"], now: T0 + DAY });
  const crownsOf = u => rows.find(r => r.uid === u).events.filter(e => e.kind === "crown").map(e => e.label);
  // amy logged first, so she claimed the crowns everyone ties on; bo passed her on catches, species, records, kept fish.
  assert.ok(crownsOf("bo").includes("⚙️ Grinder crown"));
  assert.ok(crownsOf("bo").includes("👑 Record Holder crown"));
  assert.ok(crownsOf("amy").includes("💪 Iron Angler crown")); // both fished 1 day; amy got there first
  assert.equal(rows.find(r => r.uid === "bo").byKind.crown, 2 * crownsOf("bo").length);
  const off = rankings({ catches, derbies: [], entrants: new Map(), members: ["amy", "bo"], now: T0 + DAY,
    versions: [{ id: "v", mode: "retro", createdAt: T0, values: { ...DEFAULT_SCORING, crownPts: 0 } }] });
  assert.equal(off.find(r => r.uid === "bo").byKind.crown, 0);
});
