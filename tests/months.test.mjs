// Unit tests for Angler of the Month. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { FIRST_MONTH, monthKey, monthRange, monthName, nextMonth, monthLockAt, monthState, daysLeft, monthKeys, monthsToLock, monthWins, winsOf } from "../js/months.js";
import { monthBoard, monthSnapshot } from "../js/monthrace.js";
import { rankEvents, rankings } from "../js/rank.js";
import { badgeTimeline } from "../js/badges.js";
import { crownStandings } from "../js/crowns.js";

const at = (y, m, d, h = 12) => new Date(y, m, d, h).getTime();
let n = 0;
const fish = (uid, t, extra = {}) => ({ id: "c" + ++n, uid, species: "Perch", weightOz: null, lengthIn: null, caughtAt: t, createdAt: t, ...extra });
const input = (catches, extra = {}) => ({ catches, derbies: [], entrants: new Map(), versions: [], now: at(2026, 11, 20), ...extra });

test("month dates: keys, ranges, names, and the month after", () => {
  assert.equal(monthKey(at(2026, 10, 15)), "2026-11");
  const r = monthRange("2026-11");
  assert.equal(r.from, new Date(2026, 10, 1).getTime());
  assert.equal(r.to, new Date(2026, 11, 1).getTime() - 1);
  assert.equal(monthName("2026-11"), "November 2026");
  assert.equal(nextMonth("2026-12"), "2027-01");
  assert.equal(daysLeft("2026-11", at(2026, 10, 29, 12)), 2);
});

test("a month is live, then provisional for the late-logging days, then locked", () => {
  assert.equal(monthState("2026-11", at(2026, 10, 30)), "live");
  assert.equal(monthState("2026-11", at(2026, 11, 3)), "provisional");
  assert.equal(monthState("2026-11", monthLockAt("2026-11", 7)), "locked");
  assert.equal(monthState("2026-11", at(2026, 11, 3), 0), "locked");
});

test("races start in November 2026 (the Preseason trial)", () => {
  assert.equal(FIRST_MONTH, "2026-11");
  assert.deepEqual(monthKeys(at(2026, 9, 20)), []);
  assert.deepEqual(monthKeys(at(2027, 0, 20)), ["2027-01", "2026-12", "2026-11"]);
  const docs = new Map([["2026-11", { key: "2026-11" }]]);
  assert.deepEqual(monthsToLock(docs, at(2027, 0, 20)), ["2026-12"]);
  assert.deepEqual(monthsToLock(new Map(), at(2027, 0, 5)), ["2026-11"]); // December is still provisional
});

test("the board counts season points earned in the month, ties go to most fish then the biggest fish", () => {
  const catches = [
    fish("amy", at(2026, 10, 2)), fish("amy", at(2026, 10, 3)),
    fish("bo", at(2026, 10, 2)), fish("bo", at(2026, 10, 4, 9), { weightOz: 20 }),
    fish("cy", at(2026, 10, 5)),
    fish("amy", at(2026, 9, 30)), // October: not this month
  ];
  const b = monthBoard(input(catches), "2026-11");
  // Bo and Cy get their first Perch of the season (and badges) this month; Amy got hers in October, so only her 2 catches count.
  assert.deepEqual(b.rows.map(r => [r.uid, r.fish, r.place]), [["bo", 2, 1], ["cy", 1, 2], ["amy", 2, 3]]);
  assert.equal(b.rows[2].points, 2);
  assert.ok(b.rows[0].points > b.rows[1].points);
  assert.equal(b.anglers, 3);
  assert.equal(b.winner, "bo");
  // A tie on points and fish goes to the bigger fish.
  const tie = monthBoard(input([fish("x", at(2026, 10, 2), { weightOz: 30 }), fish("y", at(2026, 10, 2), { weightOz: 40 }), fish("z", at(2026, 10, 2))]), "2026-11");
  assert.deepEqual(tie.rows.map(r => r.uid).slice(0, 2), ["y", "x"]);
});

test("a quiet month (fewer than 3 anglers) has no winner", () => {
  const b = monthBoard(input([fish("amy", at(2026, 10, 2)), fish("bo", at(2026, 10, 3))]), "2026-11");
  assert.equal(b.anglers, 2);
  assert.equal(b.winner, null);
  const snap = monthSnapshot(input([fish("amy", at(2026, 10, 2))]), "2026-11", { now: 9, by: "admin" });
  assert.deepEqual({ ...snap, board: snap.board.map(r => [r.uid, r.place, r.fish]) },
    { key: "2026-11", winner: null, points: 0, fish: 0, anglers: 1, board: [["amy", 1, 1]], lockedAt: 9, lockedBy: "admin" });
});

test("disqualified and logbook catches don't count", () => {
  const b = monthBoard(input([fish("amy", at(2026, 10, 2), { dq: true }), fish("bo", at(2026, 10, 2), { past: true })]), "2026-11");
  assert.deepEqual(b.rows, []);
});

test("a saved win: bonus points in its month, the badge, and the Monthly Master crown", () => {
  const catches = [fish("amy", at(2026, 10, 2)), fish("bo", at(2026, 10, 2)), fish("cy", at(2026, 10, 2))];
  const monthDocs = new Map([["2026-11", { key: "2026-11", winner: "amy", points: 4 }], ["2026-12", { key: "2026-12", winner: null }]]);
  assert.deepEqual(monthWins(monthDocs).map(w => [w.key, w.uid, w.at]), [["2026-11", "amy", monthRange("2026-11").to]]);
  assert.equal(winsOf("amy", monthDocs), 1);
  const inp = input(catches, { monthDocs, now: at(2027, 0, 20) });
  const ev = rankEvents(inp).filter(e => e.kind === "month");
  assert.deepEqual(ev.map(e => [e.uid, e.pts, e.at]), [["amy", 5, monthRange("2026-11").to]]);
  const badge = badgeTimeline(inp).find(b => b.badge.id === "aotm");
  assert.deepEqual([badge.uid, badge.season, badge.at], ["amy", 2026, monthRange("2026-11").to]);
  const crowns2026 = crownStandings({ ...inp, now: at(2026, 11, 20) }).find(s => s.crown.id === "monthMaster");
  assert.equal(crowns2026.holder, "amy");
  // The prizes don't count toward the next month's race.
  const dec = monthBoard({ ...inp, now: at(2026, 11, 20) }, "2026-12");
  assert.deepEqual(dec.rows, []);
  // Admins can turn the bonus off.
  const off = rankEvents({ ...inp, versions: [{ id: "v", mode: "retro", createdAt: 1, values: { monthPts: 0 } }] }).filter(e => e.kind === "month");
  assert.deepEqual(off, []);
  assert.ok(rankings(inp)[0].byKind.month >= 0);
});
