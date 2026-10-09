// Unit tests for end-of-season awards. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { seasonYears, seasonRange, seasonPoints, seasonAwards, seasonSnapshot } from "../js/awards.js";

const at = (y, m, d, h = 12) => new Date(y, m, d, h).getTime();
const c = (id, uid, species, caughtAt, extra = {}) => ({ id, uid, species, caughtAt, createdAt: caughtAt, ...extra });
const B = { id: "t", icon: "🏅", name: "Test" };
const base = extra => ({ derbies: [], entrants: new Map(), versions: [], members: ["amy", "bo", "cy"], crowns: [], badges: [], skunks: [],
  trips: new Map(), rsvps: new Map(), fleet: new Map(), tackle: new Map(), name: u => u, ...extra });

test("seasons run from the year of the first league catch to this year, newest first", () => {
  const now = at(2026, 9, 8);
  assert.deepEqual(seasonYears([c("a", "amy", "Walleye", at(2024, 5, 1)), c("p", "amy", "Walleye", at(2019, 5, 1), { past: true })], now), [2026, 2025, 2024]);
  assert.deepEqual(seasonYears([], now), [2026]);
  assert.deepEqual(seasonRange(2026).from, at(2026, 0, 1, 0));
});

test("a finished season counts points earned during it; the current one matches 'This season'", () => {
  const catches = [c("a", "amy", "Walleye", at(2025, 5, 1)), c("b", "bo", "Walleye", at(2025, 5, 2)), c("d", "bo", "Muskie", at(2025, 6, 2)),
    c("e", "amy", "Walleye", at(2026, 5, 1))];
  const past = seasonPoints(2025, base({ catches }), at(2026, 9, 8));
  assert.equal(past[0].uid, "bo");
  assert.ok(past[0].points > past[1].points);
  const now = seasonPoints(2026, base({ catches }), at(2026, 9, 8));
  assert.equal(now[0].uid, "amy");
});

test("superlatives: biggest fish, most fish and species, days out and skunks, records, badges, top boat and lure", () => {
  const catches = [
    c("a", "amy", "Walleye", at(2026, 4, 1), { weightOz: 80 }), c("b", "amy", "Yellow Perch", at(2026, 4, 1, 15), { fishCount: 20, limit: true, boatId: "b1" }),
    c("d", "bo", "Muskie", at(2026, 4, 3), { lengthIn: 44, boatId: "b1" }), c("e", "bo", "Walleye", at(2026, 4, 4), { weightOz: 90 }),
    c("f", "bo", "Pike", at(2026, 4, 5), { weightOz: 120 }), c("x", "cy", "Walleye", at(2026, 4, 6), { weightOz: 999, dq: true }),
    c("old", "cy", "Walleye", at(2025, 4, 6), { weightOz: 500 }),
  ];
  const input = base({ catches, skunks: [{ uid: "cy", day: "2026-05-10" }, { uid: "cy", day: "2026-05-11" }],
    badges: [{ uid: "bo", at: at(2026, 4, 3), badge: B }, { uid: "bo", at: at(2026, 4, 4), badge: B }, { uid: "amy", at: at(2025, 1, 1), badge: B }],
    fleet: new Map([["b1", { id: "b1", uid: "amy", name: "The Lund" }]]),
    tackle: new Map([["a", { lure: "Jig", shared: true }], ["e", { lure: "jig", shared: true }], ["f", { lure: "Spoon", shared: false }]]) });
  const s = seasonAwards(2026, input, at(2026, 9, 8));
  const a = Object.fromEntries(s.awards.map(x => [x.id, x]));
  assert.equal(a.biggest.c.id, "f");                       // heaviest (the disqualified one doesn't count)
  assert.deepEqual([a.fish.uid, a.fish.n], ["amy", 21]);    // a stringer counts its fish
  assert.deepEqual([a.species.uid, a.species.n], ["bo", 3]);
  assert.deepEqual([a.days.uid, a.days.n], ["bo", 3]);
  assert.deepEqual([a.skunks.uid, a.skunks.n], ["cy", 2]);
  assert.equal(a.badges.uid, "bo");
  assert.deepEqual([a.boat.boatId, a.boat.n], ["b1", 21]);
  assert.equal(a.lure.text, "Jig: 2 fish");                 // secret tackle isn't counted
  assert.ok(s.ongoing);
  assert.ok(s.records.every(r => r.from >= s.from));
  assert.equal(a.records.uid, "bo");                        // walleye weight, muskie length and weight… pike: bo sets more
});

test("crowns held at the end of a season are that season's crowns", () => {
  const X = { id: "x", name: "X" }, Y = { id: "y", name: "Y" };
  const crownHistory = [{ crown: X, year: 2025, holder: "amy" }, { crown: Y, year: 2025, holder: null },
    { crown: X, year: 2026, holder: "bo" }, { crown: Y, year: 2026, holder: "bo" }];
  const s25 = seasonAwards(2025, base({ catches: [], crownHistory }), at(2026, 9, 8));
  assert.deepEqual(s25.crowns.map(x => [x.crown.id, x.uid]), [["x", "amy"]]);
  const s26 = seasonAwards(2026, base({ catches: [], crownHistory }), at(2026, 9, 8));
  assert.deepEqual(s26.crowns.map(x => x.uid), ["bo", "bo"]);
});

test("records set in a season are season records: last season's fish don't stand in the way", () => {
  const catches = [c("old", "cy", "Walleye", at(2025, 4, 6), { weightOz: 500 }), c("a", "amy", "Walleye", at(2026, 4, 1), { weightOz: 80 })];
  const s = seasonAwards(2026, base({ catches }), at(2026, 9, 8));
  assert.deepEqual(s.records.map(r => r.c.id), ["a"]);
});

test("the saved season: final standings with the records held at the end, the champion, records and awards", () => {
  const catches = [c("a", "amy", "Walleye", at(2026, 4, 1), { weightOz: 80 }), c("b", "bo", "Walleye", at(2026, 4, 2), { weightOz: 90 }),
    c("n", "amy", "Walleye", at(2027, 1, 1), { weightOz: 120 })];
  const snap = seasonSnapshot(base({ catches }), 2026, { now: at(2027, 0, 9), by: "amy" });
  assert.equal(snap.year, 2026); assert.equal(snap.lockedBy, "amy");
  assert.equal(snap.champion, "bo");                                  // 1 + 3 + 5 for the record he held on Dec 31
  assert.deepEqual(snap.standings.map(r => [r.uid, r.place, r.points]), [["bo", 1, 9], ["amy", 2, 7], ["cy", 3, 0]]); // amy: 2nd on the board, 3 more
  assert.deepEqual(snap.records.map(r => [r.species, r.field, r.catchId]), [["Walleye", "weightOz", "b"]]);
  assert.ok(snap.awards.some(x => x.id === "biggest" && x.catchId === "b"));
  assert.doesNotThrow(() => JSON.stringify(snap));
});
