// Unit tests for derby status, entry rules and standings. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, derbyStatus, entryProblem, derbyEntries, standings, closesAt, nextDates } from "../js/derby.js";

const H = 3600 * 1000;
const derby = (extra = {}) => ({ ...DEFAULTS, id: "d1", name: "Test", start: 10 * H, end: 20 * H, ...extra });
let n = 0;
const fish = (uid, species, weightOz, lengthIn, hour, extra = {}) =>
  ({ id: `c${++n}`, uid, species, weightOz, lengthIn, caughtAt: hour * H, createdAt: hour * H, released: true, derbyId: "d1", ...extra });

test("status moves from upcoming to live to final entries to finished", () => {
  const d = derby();
  assert.equal(derbyStatus(d, 9 * H), "upcoming");
  assert.equal(derbyStatus(d, 15 * H), "active");
  assert.equal(derbyStatus(d, 30 * H), "closing");   // within the 24 h grace
  assert.equal(derbyStatus(d, 45 * H), "ended");
  assert.equal(closesAt(d), 44 * H);
  assert.equal(derbyStatus({ ...d, cancelled: true }, 15 * H), "cancelled");
});

test("entry rules: time, species, sizes, release, spot, crew and DQ", () => {
  const d = derby({ species: ["Walleye"], minWeightOz: 32, minLengthIn: 15, catchRelease: true, requireLocation: true, requireCrew: true });
  const ok = fish("a", "Walleye", 40, 18, 12, { locShared: true, captain: { uid: "b" }, netman: { guest: "Sam" } });
  assert.equal(entryProblem(ok, d), "");
  assert.match(entryProblem({ ...ok, caughtAt: 21 * H }, d), /outside/);
  assert.match(entryProblem({ ...ok, species: "Northern Pike" }, d), /Species/);
  assert.match(entryProblem({ ...ok, weightOz: 30 }, d), /minimum weight/);
  assert.match(entryProblem({ ...ok, lengthIn: 14 }, d), /minimum length/);
  assert.match(entryProblem({ ...ok, released: false }, d), /released/);
  assert.match(entryProblem({ ...ok, locShared: false }, d), /spot/);
  assert.match(entryProblem({ ...ok, netman: null }, d), /captain and net man/);
  assert.match(entryProblem({ ...ok, dq: true, dqReason: "No scale in photo" }, d), /Disqualified: No scale/);
  assert.match(entryProblem({ ...ok, weightOz: null }, derby({ scoring: "heaviest" })), /Needs a weight/);
  assert.match(entryProblem({ ...ok, lengthIn: null }, derby({ scoring: "longest" })), /Needs a length/);
});

test("entries past an angler's limit don't count, in the order they were caught", () => {
  const d = derby({ maxEntries: 2 });
  const list = derbyEntries(d, [fish("a", "Walleye", 50, 0, 13), fish("a", "Walleye", 40, 0, 11), fish("a", "Walleye", 90, 0, 15)]);
  assert.deepEqual(list.map(e => [e.weightOz, e.problem]), [[40, ""], [50, ""], [90, "Over the limit of 2 entries"]]);
});

test("only anglers who joined count, and catches from other derbies are ignored", () => {
  const d = derby();
  const rows = standings(d, [fish("a", "Walleye", 50, 0, 12), fish("x", "Walleye", 99, 0, 12), fish("a", "Walleye", 99, 0, 12, { derbyId: "other" })], new Set(["a"]));
  assert.deepEqual(rows.map(r => [r.uid, r.score]), [["a", 50]]);
});

test("heaviest and longest: best single fish; ties go to whoever caught it first", () => {
  const all = [fish("a", "Walleye", 80, 20, 14), fish("b", "Walleye", 80, 25, 12), fish("c", "Walleye", 60, 30, 11), fish("a", "Walleye", 50, 22, 11)];
  assert.deepEqual(standings(derby({ scoring: "heaviest" }), all).map(r => [r.uid, r.score]), [["b", 80], ["a", 80], ["c", 60]]);
  assert.deepEqual(standings(derby({ scoring: "longest" }), all).map(r => [r.uid, r.score]), [["c", 30], ["b", 25], ["a", 22]]);
});

test("bag: sum of each angler's best N fish; ties go to the bigger biggest fish", () => {
  const all = [
    fish("a", "Bass", 40, 0, 11), fish("a", "Bass", 30, 0, 12), fish("a", "Bass", 20, 0, 13), fish("a", "Bass", 10, 0, 14),
    fish("b", "Bass", 50, 0, 11), fish("b", "Bass", 25, 0, 12), fish("b", "Bass", 15, 0, 13),
  ];
  const rows = standings(derby({ scoring: "bag", bagSize: 3 }), all);
  assert.deepEqual(rows.map(r => [r.uid, r.score, r.fish.length]), [["b", 90, 3], ["a", 90, 3]]);
});

test("most fish and most species", () => {
  const all = [fish("a", "Perch", 5, 0, 11), fish("a", "Perch", 6, 0, 12), fish("a", "Perch", 7, 0, 13),
    fish("b", "Perch", 5, 0, 11), fish("b", "Bass", 30, 0, 12)];
  assert.deepEqual(standings(derby({ scoring: "most" }), all).map(r => [r.uid, r.score]), [["a", 3], ["b", 2]]);
  assert.deepEqual(standings(derby({ scoring: "species" }), all).map(r => [r.uid, r.score]), [["b", 2], ["a", 1]]);
});

test("a stringer is never a derby entry", () => {
  const d = { ...DEFAULTS, scoring: "most", start: 0, end: 100 };
  assert.equal(entryProblem({ uid: "u", species: "Yellow Perch", caughtAt: 50, fishCount: 20, limit: false }, d), "Stringers can't be entered in a derby");
});

test("a copied derby moves on by whole weeks to the same weekday and time, in the future", () => {
  const start = new Date(2026, 4, 2, 6).getTime(), end = new Date(2026, 4, 2, 18).getTime(); // Sat 2 May, 6 AM to 6 PM
  const now = new Date(2026, 4, 20, 9).getTime(); // Wed 20 May
  const n = nextDates(start, end, now);
  assert.equal(new Date(n.start).toString(), new Date(2026, 4, 23, 6).toString()); // Sat 23 May, 6 AM
  assert.equal(n.end - n.start, end - start);
  // An upcoming derby copies to the week after it, never onto itself.
  const soon = nextDates(new Date(2026, 4, 23, 6).getTime(), new Date(2026, 4, 23, 18).getTime(), now);
  assert.equal(new Date(soon.start).getDate(), 30);
  // Across a clock change, 6 AM stays 6 AM.
  const fall = nextDates(new Date(2026, 9, 31, 6).getTime(), new Date(2026, 9, 31, 18).getTime(), new Date(2026, 10, 2).getTime());
  assert.equal(new Date(fall.start).getHours(), 6);
});
